import "server-only";

import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/db";
import { GMAIL_CACHE_MS, GMAIL_IMPORTANCE_QUERY, GMAIL_MESSAGE_LIMIT } from "./config";

export type GmailEmail = {
  id: string;
  sender: string;
  subject: string;
  category: string;
  receivedAt: string;
  unread: boolean;
};

export type GmailInboxResult =
  | { status: "connected"; unreadCount: number; emails: GmailEmail[] }
  | { status: "reconnect" }
  | { status: "error" };

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const messageListSchema = z.object({
  messages: z.array(z.object({ id: z.string() }).passthrough()).optional(),
  resultSizeEstimate: z.number().optional(),
}).passthrough();

const messageSchema = z.object({
  id: z.string(),
  labelIds: z.array(z.string()).optional(),
  internalDate: z.string().optional(),
  payload: z.object({
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  }).passthrough().optional(),
}).passthrough();

let cachedResult: GmailInboxResult | undefined;
let cachedUntil = 0;

class RevokedGoogleToken extends Error {}

async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured.");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new RevokedGoogleToken("Google refresh token was rejected.");

  const token = tokenResponseSchema.safeParse(await response.json());
  if (!token.success) throw new Error("Google returned an invalid token response.");

  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from("integrations")
    .select("refresh_token_enc,scope")
    .eq("provider", "google")
    .single();
  if (readError) throw new Error("Google integration could not be read.");

  const { error: writeError } = await supabase.from("integrations").upsert({
    provider: "google",
    access_token_enc: await encryptSecret(token.data.access_token),
    refresh_token_enc: token.data.refresh_token
      ? await encryptSecret(token.data.refresh_token)
      : existing.refresh_token_enc,
    expires_at: new Date(Date.now() + token.data.expires_in * 1000).toISOString(),
    scope: token.data.scope ?? existing.scope,
    updated_at: new Date().toISOString(),
  });
  if (writeError) throw new Error("Google token could not be saved.");
  return token.data.access_token;
}

async function getGoogleAccessToken(forceRefresh = false): Promise<string> {
  const { data: integration, error } = await getSupabaseAdmin()
    .from("integrations")
    .select("access_token_enc,refresh_token_enc,expires_at")
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw new Error("Google integration could not be read.");
  if (!integration?.refresh_token_enc) throw new RevokedGoogleToken("Google account needs to reconnect.");

  const shouldRefresh = forceRefresh || !integration.access_token_enc || !integration.expires_at
    || new Date(integration.expires_at).getTime() <= Date.now() + 60_000;
  if (shouldRefresh) return refreshGoogleAccessToken(await decryptSecret(integration.refresh_token_enc));
  return decryptSecret(integration.access_token_enc);
}

async function gmailGet(path: string, accessToken: string): Promise<Response> {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}

function categoryFromLabels(labels: string[]): string {
  const category = labels.find((label) => label.startsWith("CATEGORY_"));
  if (!category) return "Inbox";
  return category.slice("CATEGORY_".length).toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function getHeader(message: z.infer<typeof messageSchema>, name: string): string {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseMessage(message: z.infer<typeof messageSchema>): GmailEmail {
  const receivedAt = getHeader(message, "Date");
  const internalDate = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null;
  const headerDate = receivedAt ? new Date(receivedAt) : null;
  const safeHeaderDate = headerDate && !Number.isNaN(headerDate.getTime()) ? headerDate.toISOString() : null;
  return {
    id: message.id,
    sender: getHeader(message, "From") || "Unknown sender",
    subject: getHeader(message, "Subject") || "(no subject)",
    category: categoryFromLabels(message.labelIds ?? []),
    receivedAt: safeHeaderDate ?? internalDate ?? new Date().toISOString(),
    unread: message.labelIds?.includes("UNREAD") ?? false,
  };
}

async function loadInbox(): Promise<GmailInboxResult> {
  let accessToken = await getGoogleAccessToken();
  const query = new URLSearchParams({ q: GMAIL_IMPORTANCE_QUERY, maxResults: String(GMAIL_MESSAGE_LIMIT) });
  let listResponse = await gmailGet(`messages?${query}`, accessToken);
  if (listResponse.status === 401) {
    accessToken = await getGoogleAccessToken(true);
    listResponse = await gmailGet(`messages?${query}`, accessToken);
  }
  if (listResponse.status === 401 || listResponse.status === 403) throw new RevokedGoogleToken("Gmail access was rejected.");
  if (!listResponse.ok) throw new Error("Gmail messages could not be loaded.");
  const listResult = messageListSchema.safeParse(await listResponse.json());
  if (!listResult.success) throw new Error("Gmail returned an invalid message list.");

  const unreadQuery = new URLSearchParams({ q: "is:unread", maxResults: "1" });
  const [unreadResponse, messageResults] = await Promise.all([
    gmailGet(`messages?${unreadQuery}`, accessToken),
    Promise.all((listResult.data.messages ?? []).map(async ({ id }) => {
      const response = await gmailGet(`messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, accessToken);
      if (response.status === 401 || response.status === 403) throw new RevokedGoogleToken("Gmail access was rejected.");
      if (!response.ok) throw new Error("Gmail message metadata could not be loaded.");
      const message = messageSchema.safeParse(await response.json());
      if (!message.success) throw new Error("Gmail returned invalid message metadata.");
      return parseMessage(message.data);
    })),
  ]);
  if (unreadResponse.status === 401 || unreadResponse.status === 403) throw new RevokedGoogleToken("Gmail access was rejected.");
  if (!unreadResponse.ok) throw new Error("Gmail unread count could not be loaded.");
  const unreadResult = messageListSchema.safeParse(await unreadResponse.json());
  if (!unreadResult.success) throw new Error("Gmail returned an invalid unread count.");

  return {
    status: "connected",
    unreadCount: unreadResult.data.resultSizeEstimate ?? 0,
    emails: messageResults,
  };
}

export async function getImportantEmails(): Promise<GmailInboxResult> {
  if (cachedResult && cachedUntil > Date.now()) return cachedResult;

  try {
    cachedResult = await loadInbox();
    cachedUntil = Date.now() + GMAIL_CACHE_MS;
  } catch (error) {
    cachedResult = error instanceof RevokedGoogleToken ? { status: "reconnect" } : { status: "error" };
    cachedUntil = Date.now() + (error instanceof RevokedGoogleToken ? GMAIL_CACHE_MS : 30_000);
  }
  return cachedResult;
}

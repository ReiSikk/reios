import 'server-only';

import { z } from 'zod';
import { getGoogleAccessToken, RevokedGoogleToken } from '@/lib/integrations/google-token';
import {
  GMAIL_CACHE_MS,
  GMAIL_IMPORTANCE_QUERY,
  GMAIL_INVOICE_LIMIT,
  GMAIL_INVOICE_QUERY,
  GMAIL_MESSAGE_LIMIT,
  INVOICE_DISPLAY_LIMIT,
  INVOICE_SENDER_FILTER,
} from './config';

export type GmailEmail = {
  id: string;
  sender: string;
  subject: string;
  category: string;
  receivedAt: string;
  unread: boolean;
};

export type GmailInvoice = GmailEmail & { company: string | null };

export type GmailInboxResult =
  | {
      status: 'connected';
      unreadCount: number;
      emails: GmailEmail[];
      invoices: GmailInvoice[];
      invoiceCompanies: string[];
    }
  | { status: 'reconnect' }
  | { status: 'error' };

const messageListSchema = z
  .object({
    messages: z.array(z.object({ id: z.string() }).passthrough()).optional(),
    resultSizeEstimate: z.number().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    id: z.string(),
    labelIds: z.array(z.string()).optional(),
    internalDate: z.string().optional(),
    payload: z
      .object({
        headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

let cachedResult: GmailInboxResult | undefined;
let cachedUntil = 0;

class ExpiredGoogleAccessToken extends Error {}

async function gmailGet(path: string, accessToken: string): Promise<Response> {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
}

function categoryFromLabels(labels: string[]): string {
  const category = labels.find((label) => label.startsWith('CATEGORY_'));
  if (!category) return 'Inbox';
  return category
    .slice('CATEGORY_'.length)
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function getHeader(message: z.infer<typeof messageSchema>, name: string): string {
  return (
    message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ''
  );
}

function parseMessage(message: z.infer<typeof messageSchema>): GmailEmail {
  const receivedAt = getHeader(message, 'Date');
  const internalDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : null;
  const headerDate = receivedAt ? new Date(receivedAt) : null;
  const safeHeaderDate =
    headerDate && !Number.isNaN(headerDate.getTime()) ? headerDate.toISOString() : null;
  return {
    id: message.id,
    sender: getHeader(message, 'From') || 'Unknown sender',
    subject: getHeader(message, 'Subject') || '(no subject)',
    category: categoryFromLabels(message.labelIds ?? []),
    receivedAt: safeHeaderDate ?? internalDate ?? new Date().toISOString(),
    unread: message.labelIds?.includes('UNREAD') ?? false,
  };
}

async function loadMessageSummaries(
  queryText: string,
  limit: number,
  accessToken: string
): Promise<GmailEmail[]> {
  const query = new URLSearchParams({ q: queryText, maxResults: String(limit) });
  const response = await gmailGet(`messages?${query}`, accessToken);
  if (response.status === 401) throw new ExpiredGoogleAccessToken('Google access token expired.');
  if (response.status === 403) throw new RevokedGoogleToken('Gmail access was rejected.');
  if (!response.ok) throw new Error('Gmail messages could not be loaded.');
  const listResult = messageListSchema.safeParse(await response.json());
  if (!listResult.success) throw new Error('Gmail returned an invalid message list.');

  return Promise.all(
    (listResult.data.messages ?? []).map(async ({ id }) => {
      const messageResponse = await gmailGet(
        `messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        accessToken
      );
      if (messageResponse.status === 401)
        throw new ExpiredGoogleAccessToken('Google access token expired.');
      if (messageResponse.status === 403)
        throw new RevokedGoogleToken('Gmail access was rejected.');
      if (!messageResponse.ok) throw new Error('Gmail message metadata could not be loaded.');
      const message = messageSchema.safeParse(await messageResponse.json());
      if (!message.success) throw new Error('Gmail returned invalid message metadata.');
      return parseMessage(message.data);
    })
  );
}

async function loadUnreadCount(accessToken: string): Promise<number> {
  const query = new URLSearchParams({ q: 'is:unread', maxResults: '1' });
  const response = await gmailGet(`messages?${query}`, accessToken);
  if (response.status === 401) throw new ExpiredGoogleAccessToken('Google access token expired.');
  if (response.status === 403) throw new RevokedGoogleToken('Gmail access was rejected.');
  if (!response.ok) throw new Error('Gmail unread count could not be loaded.');
  const unreadResult = messageListSchema.safeParse(await response.json());
  if (!unreadResult.success) throw new Error('Gmail returned an invalid unread count.');
  return unreadResult.data.resultSizeEstimate ?? 0;
}

function normalizeSenderSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function companyForSender(sender: string): string | null {
  const normalizedSender = normalizeSenderSearchText(sender);
  return (
    INVOICE_SENDER_FILTER.companyNames.find((company) => {
      const normalizedCompany = normalizeSenderSearchText(company);
      return normalizedCompany.length > 0 && normalizedSender.includes(normalizedCompany);
    }) ?? null
  );
}

function matchesConfiguredInvoiceSender(sender: string): boolean {
  const normalizedSender = normalizeSenderSearchText(sender);
  const companyMatch = companyForSender(sender) !== null;
  const keywordMatch = INVOICE_SENDER_FILTER.senderKeywords.some((keyword) => {
    const normalizedKeyword = normalizeSenderSearchText(keyword);
    return normalizedKeyword.length > 0 && normalizedSender.includes(normalizedKeyword);
  });
  return companyMatch || keywordMatch;
}

async function loadInboxData(accessToken: string): Promise<GmailInboxResult> {
  const [emails, invoices, unreadCount] = await Promise.all([
    loadMessageSummaries(GMAIL_IMPORTANCE_QUERY, GMAIL_MESSAGE_LIMIT, accessToken),
    INVOICE_SENDER_FILTER.companyNames.length + INVOICE_SENDER_FILTER.senderKeywords.length > 0
      ? loadMessageSummaries(GMAIL_INVOICE_QUERY, GMAIL_INVOICE_LIMIT, accessToken)
      : Promise.resolve([]),
    loadUnreadCount(accessToken),
  ]);
  return {
    status: 'connected',
    unreadCount,
    emails,
    invoices: invoices
      .filter((invoice) => matchesConfiguredInvoiceSender(invoice.sender))
      .slice(0, INVOICE_DISPLAY_LIMIT)
      .map((invoice) => ({ ...invoice, company: companyForSender(invoice.sender) })),
    invoiceCompanies: INVOICE_SENDER_FILTER.companyNames,
  };
}

async function loadInbox(): Promise<GmailInboxResult> {
  const accessToken = await getGoogleAccessToken();
  try {
    return await loadInboxData(accessToken);
  } catch (error) {
    if (!(error instanceof ExpiredGoogleAccessToken)) throw error;
    return loadInboxData(await getGoogleAccessToken(true));
  }
}

export async function getImportantEmails(): Promise<GmailInboxResult> {
  if (cachedResult && cachedUntil > Date.now()) return cachedResult;

  try {
    cachedResult = await loadInbox();
    cachedUntil = Date.now() + GMAIL_CACHE_MS;
  } catch (error) {
    cachedResult =
      error instanceof RevokedGoogleToken ? { status: 'reconnect' } : { status: 'error' };
    cachedUntil = Date.now() + (error instanceof RevokedGoogleToken ? GMAIL_CACHE_MS : 30_000);
  }
  return cachedResult;
}

import 'server-only';

import { z } from 'zod';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { getSupabaseAdmin } from '@/lib/db';

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

export class RevokedGoogleToken extends Error {}

async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured.');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!response.ok) throw new RevokedGoogleToken('Google refresh token was rejected.');

  const token = tokenResponseSchema.safeParse(await response.json());
  if (!token.success) throw new Error('Google returned an invalid token response.');

  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from('integrations')
    .select('refresh_token_enc,scope')
    .eq('provider', 'google')
    .single();
  if (readError) throw new Error('Google integration could not be read.');

  const { error: writeError } = await supabase.from('integrations').upsert({
    provider: 'google',
    access_token_enc: await encryptSecret(token.data.access_token),
    refresh_token_enc: token.data.refresh_token
      ? await encryptSecret(token.data.refresh_token)
      : existing.refresh_token_enc,
    expires_at: new Date(Date.now() + token.data.expires_in * 1000).toISOString(),
    scope: token.data.scope ?? existing.scope,
    updated_at: new Date().toISOString(),
  });
  if (writeError) throw new Error('Google token could not be saved.');
  return token.data.access_token;
}

export async function getGoogleAccessToken(forceRefresh = false): Promise<string> {
  const { data: integration, error } = await getSupabaseAdmin()
    .from('integrations')
    .select('access_token_enc,refresh_token_enc,expires_at')
    .eq('provider', 'google')
    .maybeSingle();
  if (error) throw new Error('Google integration could not be read.');
  if (!integration?.refresh_token_enc)
    throw new RevokedGoogleToken('Google account needs to reconnect.');

  const shouldRefresh =
    forceRefresh ||
    !integration.access_token_enc ||
    !integration.expires_at ||
    new Date(integration.expires_at).getTime() <= Date.now() + 60_000;
  if (shouldRefresh)
    return refreshGoogleAccessToken(await decryptSecret(integration.refresh_token_enc));
  return decryptSecret(integration.access_token_enc);
}

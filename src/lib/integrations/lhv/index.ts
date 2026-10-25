import 'server-only';

import { z } from 'zod';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { getSupabaseAdmin } from '@/lib/db';
import type { LhvAccountSummary, LhvDashboardData } from './types';

const LHV_API_BASE_URL = 'https://api.lhv.ai/api/v1';
const LHV_TOKEN_URL = 'https://auth.lhv.ai/oauth2/token';
const LHV_CLIENT_ID = 'api-access';
const LHV_CACHE_MS = 2 * 60 * 1000;
const LHV_PORTFOLIO_ATTEMPTS = 3;
const LHV_RETRY_DELAY_MS = 250;
const LHV_DASHBOARD_ACCOUNTS = [
  { id: 'main-account', apiName: 'Rei Sikk', apiType: 'CURRENT', label: 'Main account' },
  {
    id: 'savings-account',
    apiName: 'Kogumiskonto - Meelerahufond',
    apiType: 'CURRENT',
    label: 'Kogumiskonto - Meelerahufond',
  },
] as const;

const accountSchema = z.object({
  iban: z.string(),
  currency: z.string(),
  availableBalance: z.number(),
  type: z.string().optional(),
  name: z.string().optional(),
  subtype: z.string().nullable().optional(),
});

const accountsSchema = z.array(accountSchema);

const instrumentPortfolioSchema = z.object({
  summary: z.object({
    totalValue: z.number(),
    baseCurrency: z.string(),
  }),
});

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

type StoredLhvTokens = {
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scope: string | null;
};

class LhvNotConfiguredError extends Error {}
class LhvAuthorizationError extends Error {}
class LhvPermissionError extends Error {}
class LhvTransientError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
  }
}
let cachedResult: LhvDashboardData | undefined;
let cachedUntil = 0;

function getEnvToken(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

async function readStoredTokens(): Promise<StoredLhvTokens | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('integrations')
    .select('access_token_enc,refresh_token_enc,expires_at,scope')
    .eq('provider', 'lhv')
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
  scope: string | null
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('integrations')
    .upsert({
      provider: 'lhv',
      access_token_enc: await encryptSecret(accessToken),
      refresh_token_enc: await encryptSecret(refreshToken),
      expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      scope,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

async function refreshAccessToken(refreshToken: string, scope: string | null): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: LHV_CLIENT_ID,
  });
  const response = await fetch(LHV_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new LhvTransientError('LHV token service is temporarily unavailable.', response.status);
    }
    throw new LhvAuthorizationError('LHV authorization needs renewal.');
  }
  const result = tokenResponseSchema.safeParse(await response.json());
  if (!result.success) throw new Error('LHV returned an invalid token response.');

  await storeTokens(
    result.data.access_token,
    result.data.refresh_token ?? refreshToken,
    result.data.expires_in ?? 3600,
    result.data.scope ?? scope
  );
  return result.data.access_token;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  let stored = await readStoredTokens();

  if (!stored) {
    const accessToken = getEnvToken('LHV_ACCESS_TOKEN', 'ACCESS_TOKEN');
    const refreshToken = getEnvToken('LHV_REFRESH_TOKEN', 'REFRESH_TOKEN');
    if (!accessToken || !refreshToken) throw new LhvNotConfiguredError();
    await storeTokens(accessToken, refreshToken, 3300, null);
    stored = await readStoredTokens();
    if (!stored) throw new Error('LHV tokens could not be stored.');
  }

  if (!stored.access_token_enc || !stored.refresh_token_enc) {
    throw new LhvNotConfiguredError();
  }

  if (
    !forceRefresh &&
    stored.expires_at &&
    new Date(stored.expires_at).getTime() > Date.now() + 60_000
  ) {
    return decryptSecret(stored.access_token_enc);
  }

  return refreshAccessToken(await decryptSecret(stored.refresh_token_enc), stored.scope);
}

async function lhvGet(path: string): Promise<Response> {
  const send = async (token: string) =>
    fetch(`${LHV_API_BASE_URL}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
    });

  let response = await send(await getAccessToken());
  if (response.status === 401) response = await send(await getAccessToken(true));
  if (response.status === 401) throw new LhvAuthorizationError('LHV authorization needs renewal.');
  if (response.status === 403) throw new LhvPermissionError('LHV read permission is missing.');
  return response;
}

async function fetchAccounts(): Promise<z.infer<typeof accountSchema>[]> {
  const response = await lhvGet('/accounts');
  if (!response.ok) throw new Error('LHV accounts could not be loaded.');

  const parsed = accountsSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('LHV returned invalid account data.');

  return parsed.data;
}

async function fetchInstrumentPortfolio(): Promise<z.infer<typeof instrumentPortfolioSchema>> {
  let lastFailure: 'network' | 'upstream' = 'upstream';
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt < LHV_PORTFOLIO_ATTEMPTS; attempt += 1) {
    try {
      const response = await lhvGet('/investments/balances?isSettled=true');
      if (!response.ok) {
        const canRetry =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;
        if (!canRetry) throw new Error('LHV investment balances could not be loaded.');
        lastFailure = 'upstream';
        lastStatus = response.status;
        if (attempt === LHV_PORTFOLIO_ATTEMPTS - 1) break;

        const retryAfter = Number(response.headers.get('retry-after'));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 2000)
            : LHV_RETRY_DELAY_MS * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const parsed = instrumentPortfolioSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('LHV returned invalid investment data.');
      return parsed.data;
    } catch (error) {
      if (
        error instanceof LhvPermissionError ||
        error instanceof LhvAuthorizationError ||
        error instanceof LhvNotConfiguredError ||
        (!(error instanceof TypeError) && !(error instanceof LhvTransientError))
      ) {
        throw error;
      }

      lastFailure = error instanceof TypeError ? 'network' : 'upstream';
      lastStatus = error instanceof LhvTransientError ? error.statusCode : undefined;
      if (attempt === LHV_PORTFOLIO_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, LHV_RETRY_DELAY_MS * 2 ** attempt));
    }
  }

  console.warn('LHV investment balances could not be loaded after retries.', {
    failure: lastFailure,
    status: lastStatus,
  });
  throw new LhvTransientError('LHV investment balances are temporarily unavailable.', lastStatus);
}

async function loadLhvDashboardData(): Promise<LhvDashboardData> {
  const accountRecords = await fetchAccounts();
  const accounts: LhvAccountSummary[] = LHV_DASHBOARD_ACCOUNTS.flatMap((target) => {
    const account = accountRecords.find(
      (record) =>
        record.type === target.apiType &&
        record.name?.trim().toLocaleLowerCase() === target.apiName.toLocaleLowerCase()
    );
    return account
      ? [
          {
            id: target.id,
            name: target.label,
            currency: account.currency,
            availableBalance: account.availableBalance,
          },
        ]
      : [];
  });

  let portfolio: z.infer<typeof instrumentPortfolioSchema> | null = null;
  let holdingsStatus: 'connected' | 'permission' | 'error' = 'connected';
  try {
    portfolio = await fetchInstrumentPortfolio();
  } catch (error) {
    holdingsStatus = error instanceof LhvPermissionError ? 'permission' : 'error';
  }

  const cashCurrencyMatchesPortfolio = portfolio
    ? accounts.length === LHV_DASHBOARD_ACCOUNTS.length &&
      accounts.every((account) => account.currency === portfolio?.summary.baseCurrency)
    : false;
  const totalAssets =
    portfolio && cashCurrencyMatchesPortfolio
      ? accounts.reduce((total, account) => total + account.availableBalance, 0) +
        portfolio.summary.totalValue
      : null;

  return {
    status: 'connected',
    accounts,
    holdingsStatus,
    investmentValue: portfolio?.summary.totalValue ?? null,
    investmentCurrency: portfolio?.summary.baseCurrency ?? null,
    totalAssets,
  };
}

export async function getLhvDashboardData(): Promise<LhvDashboardData> {
  if (cachedResult && cachedUntil > Date.now()) return cachedResult;

  try {
    cachedResult = await loadLhvDashboardData();
    cachedUntil =
      cachedResult.status === 'connected' && cachedResult.holdingsStatus === 'error'
        ? Date.now()
        : Date.now() + LHV_CACHE_MS;
  } catch (error) {
    cachedResult =
      error instanceof LhvNotConfiguredError
        ? { status: 'unconfigured' }
        : error instanceof LhvAuthorizationError
          ? { status: 'reconnect' }
          : { status: 'error' };
    cachedUntil = Date.now() + (error instanceof LhvNotConfiguredError ? 10_000 : 30_000);
  }
  return cachedResult;
}

export async function reloadLhvTokensFromEnvironment(): Promise<void> {
  const accessToken = getEnvToken('LHV_ACCESS_TOKEN', 'ACCESS_TOKEN');
  const refreshToken = getEnvToken('LHV_REFRESH_TOKEN', 'REFRESH_TOKEN');
  if (!accessToken || !refreshToken) throw new LhvNotConfiguredError();

  await storeTokens(accessToken, refreshToken, 3300, null);
  cachedResult = undefined;
  cachedUntil = 0;
}

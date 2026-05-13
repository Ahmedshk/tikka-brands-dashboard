/**
 * MarketMan API v3 client with in-memory token cache.
 * Base URL: https://api.marketman.com/v3
 * Dates: yyyy/MM/dd HH:mm:ss UTC
 * Header: AUTH_TOKEN on every request after GetToken.
 */
import {
  logExternalApiResult,
  truncateForExternalApiLog,
} from '../utils/externalApiCallLog.util.js';
import { parseMarketManResponse } from '../utils/marketmanClientHelpers.js';
import {
  buildMarketManPostPayload,
  marketManFetchJsonPost,
  marketManPostOperationPath,
  resolveMarketManFailedHttpResponse,
  resolveMarketManRequestUrl,
} from '../utils/marketmanRequestExecution.util.js';

const MARKETMAN_BASE_URL = 'https://api.marketman.com/v3';
const TOKEN_PATH = '/buyers/auth/GetToken';
const EXPIRY_BUFFER_SECONDS = 60;

interface TokenCache {
  token: string;
  expireDateUtc: string;
}

let tokenCache: TokenCache | null = null;

function getApiCredentials(): { apiKey: string; apiPassword: string } {
  const apiKey = process.env.MARKETMAN_API_KEY?.trim();
  const apiPassword = process.env.MARKETMAN_API_PASSWORD?.trim();
  if (!apiKey || !apiPassword) {
    throw new Error('MARKETMAN_API_KEY and MARKETMAN_API_PASSWORD must be set');
  }
  return { apiKey, apiPassword };
}

/**
 * Format a Date to MarketMan format: yyyy/MM/dd HH:mm:ss in UTC.
 */
export function formatMarketManDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}/${m}/${d} ${h}:${min}:${s}`;
}

function isTokenExpired(expireDateUtc: string): boolean {
  try {
    const exp = new Date(expireDateUtc.replace(' ', 'T') + 'Z');
    const now = new Date();
    return now.getTime() >= exp.getTime() - EXPIRY_BUFFER_SECONDS * 1000;
  } catch {
    return true;
  }
}

/**
 * Get a valid AUTH_TOKEN, from cache or by calling GetToken.
 */
export async function getMarketManToken(): Promise<string> {
  if (tokenCache && !isTokenExpired(tokenCache.expireDateUtc)) {
    return tokenCache.token;
  }
  tokenCache = null;

  const { apiKey, apiPassword } = getApiCredentials();
  const url = `${MARKETMAN_BASE_URL}${TOKEN_PATH}`;
  const op = `POST ${TOKEN_PATH}`;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        APIKey: apiKey,
        APIPassword: apiPassword,
      }),
    });
  } catch (e) {
    const durationMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    logExternalApiResult('MarketMan', op, {
      outcome: 'error',
      durationMs,
      error: truncateForExternalApiLog(msg),
    });
    throw e instanceof Error ? e : new Error(String(e));
  }
  const durationMs = Date.now() - t0;

  const data = (await res.json()) as {
    IsSuccess?: boolean;
    ErrorMessage?: string;
    Token?: string;
    ExpireDateUTC?: string;
  };

  if (!res.ok || !data.IsSuccess || !data.Token) {
    const msg = data.ErrorMessage ?? `GetToken failed: ${res.status}`;
    logExternalApiResult('MarketMan', op, {
      outcome: 'error',
      durationMs,
      httpStatus: res.status,
      error: truncateForExternalApiLog(msg),
    });
    throw new Error(msg);
  }

  logExternalApiResult('MarketMan', op, {
    outcome: 'ok',
    durationMs,
    httpStatus: res.status,
  });

  tokenCache = {
    token: data.Token,
    expireDateUtc: data.ExpireDateUTC ?? '',
  };
  return data.Token;
}

/**
 * Clear cached token (e.g. after 401).
 */
export function clearMarketManTokenCache(): void {
  tokenCache = null;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * POST to a MarketMan API endpoint with AUTH_TOKEN and optional retry on 5xx/401.
 */
export async function marketManRequest<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  buyerGuid?: string
): Promise<T> {
  const url = resolveMarketManRequestUrl(path, MARKETMAN_BASE_URL);
  const payload = buildMarketManPostPayload(body, buyerGuid);

  let token = await getMarketManToken();
  let lastAttempt401 = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const op = `POST ${marketManPostOperationPath(path)}`;
    const attemptNum = attempt + 1;
    const { res, durationMs, text } = await marketManFetchJsonPost(
      url,
      token,
      payload,
      op,
      attemptNum,
    );
    const data = parseMarketManResponse<T>(text, res.status, path);

    if (res.status === 401 && !lastAttempt401) {
      logExternalApiResult('MarketMan', op, {
        outcome: 'error',
        durationMs,
        httpStatus: 401,
        attempt: attemptNum,
        error: 'unauthorized (refreshing token, will retry)',
      });
      clearMarketManTokenCache();
      token = await getMarketManToken();
      lastAttempt401 = true;
      continue;
    }

    if (!res.ok) {
      const failure = await resolveMarketManFailedHttpResponse(res, data, {
        path,
        op,
        durationMs,
        attemptNum,
        attemptIndex: attempt,
        maxRetries: MAX_RETRIES,
        initialBackoffMs: INITIAL_BACKOFF_MS,
      });
      if (failure.retry) continue;
      const httpErr = failure.error;
      if (httpErr instanceof Error) throw httpErr;
      throw new Error(String(httpErr));
    }

    logExternalApiResult('MarketMan', op, {
      outcome: 'ok',
      durationMs,
      httpStatus: res.status,
      attempt: attemptNum,
    });
    return data as T;
  }

  const finalPath = marketManPostOperationPath(path);
  logExternalApiResult('MarketMan', `POST ${finalPath}`, {
    outcome: 'error',
    durationMs: 0,
    attempt: MAX_RETRIES,
    error: 'request failed after retries',
  });
  throw new Error('MarketMan request failed after retries');
}

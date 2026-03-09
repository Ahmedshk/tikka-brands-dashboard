/**
 * MarketMan API v3 client with in-memory token cache.
 * Base URL: https://api.marketman.com/v3
 * Dates: yyyy/MM/dd HH:mm:ss UTC
 * Header: AUTH_TOKEN on every request after GetToken.
 */
import { parseMarketManResponse } from '../utils/marketmanClientHelpers.js';

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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      APIKey: apiKey,
      APIPassword: apiPassword,
    }),
  });

  const data = (await res.json()) as {
    IsSuccess?: boolean;
    ErrorMessage?: string;
    Token?: string;
    ExpireDateUTC?: string;
  };

  if (!res.ok || !data.IsSuccess || !data.Token) {
    const msg = data.ErrorMessage ?? `GetToken failed: ${res.status}`;
    throw new Error(msg);
  }

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
  const url = path.startsWith('http') ? path : `${MARKETMAN_BASE_URL}${path}`;
  const payload = buyerGuid ? { ...body, BuyerGuid: buyerGuid } : body;

  let token = await getMarketManToken();
  let lastAttempt401 = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AUTH_TOKEN: token,
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      throw err instanceof Error ? err : new Error(String(err));
    });

    const text = await res.text();
    const data = parseMarketManResponse<T>(text, res.status, path);

    if (res.status === 401 && !lastAttempt401) {
      clearMarketManTokenCache();
      token = await getMarketManToken();
      lastAttempt401 = true;
      continue;
    }

    if (!res.ok) {
      const msg = (data as { ErrorMessage?: string }).ErrorMessage ?? `MarketMan ${path}: ${res.status}`;
      if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new Error(msg);
    }

    return data as T;
  }

  throw new Error('MarketMan request failed after retries');
}

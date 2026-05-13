import {
  logExternalApiResult,
  truncateForExternalApiLog,
} from "./externalApiCallLog.util.js";

export function resolveMarketManRequestUrl(
  path: string,
  baseUrl: string,
): string {
  return path.startsWith("http") ? path : `${baseUrl}${path}`;
}

export function buildMarketManPostPayload(
  body: Record<string, unknown>,
  buyerGuid?: string,
): Record<string, unknown> {
  return buyerGuid ? { ...body, BuyerGuid: buyerGuid } : body;
}

export function marketManPostOperationPath(path: string): string {
  return path.startsWith("http") ? new URL(path).pathname : path;
}

export async function marketManFetchJsonPost(
  url: string,
  token: string,
  payload: Record<string, unknown>,
  op: string,
  attemptNum: number,
): Promise<{ res: Response; durationMs: number; text: string }> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        AUTH_TOKEN: token,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const durationMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    logExternalApiResult("MarketMan", op, {
      outcome: "error",
      durationMs,
      attempt: attemptNum,
      error: truncateForExternalApiLog(msg),
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
  const durationMs = Date.now() - t0;
  const text = await res.text();
  return { res, durationMs, text };
}

export interface MarketManFailedHttpContext {
  path: string;
  op: string;
  durationMs: number;
  attemptNum: number;
  attemptIndex: number;
  maxRetries: number;
  initialBackoffMs: number;
}

/**
 * Non-OK HTTP: retry once after backoff on 5xx when attempts remain; otherwise log and return error to throw.
 */
export async function resolveMarketManFailedHttpResponse(
  res: Response,
  data: unknown,
  ctx: MarketManFailedHttpContext,
): Promise<{ retry: boolean; error?: Error }> {
  const msg =
    (data as { ErrorMessage?: string }).ErrorMessage ??
    `MarketMan ${ctx.path}: ${res.status}`;
  if (res.status >= 500 && ctx.attemptIndex < ctx.maxRetries - 1) {
    logExternalApiResult("MarketMan", ctx.op, {
      outcome: "error",
      durationMs: ctx.durationMs,
      httpStatus: res.status,
      attempt: ctx.attemptNum,
      willRetry: true,
      error: truncateForExternalApiLog(msg),
    });
    await new Promise((r) =>
      setTimeout(r, ctx.initialBackoffMs * Math.pow(2, ctx.attemptIndex)),
    );
    return { retry: true };
  }
  logExternalApiResult("MarketMan", ctx.op, {
    outcome: "error",
    durationMs: ctx.durationMs,
    httpStatus: res.status,
    attempt: ctx.attemptNum,
    error: truncateForExternalApiLog(msg),
  });
  return { retry: false, error: new Error(msg) };
}

import { logger } from "./logger.util.js";

export type ExternalApiProvider = "Square" | "Homebase" | "MarketMan";

const DEFAULT_ERROR_MAX = 480;

/** Collapse whitespace and cap length so logs stay readable. */
export function truncateForExternalApiLog(
  message: string,
  maxLen = DEFAULT_ERROR_MAX,
): string {
  const oneLine = message.replaceAll(/\s+/g, " ").trim();
  return oneLine.length <= maxLen ? oneLine : `${oneLine.slice(0, maxLen)}…`;
}

export type ExternalApiResultExtras = Record<
  string,
  string | number | boolean | undefined
>;

/**
 * Logs the result of an outbound HTTP call (success or failure).
 * Use after the response is available so operators see status, duration, and errors.
 */
export function logExternalApiResult(
  provider: ExternalApiProvider,
  operation: string,
  result: {
    outcome: "ok" | "error";
    durationMs: number;
    httpStatus?: number;
    error?: string;
  } & ExternalApiResultExtras,
): void {
  const { outcome, durationMs, httpStatus, error, ...rest } = result;
  const payload: Record<string, unknown> = {
    operation,
    outcome,
    durationMs,
    ...rest,
  };
  if (httpStatus !== undefined) payload.httpStatus = httpStatus;
  if (error !== undefined) payload.error = error;

  if (outcome === "ok") {
    logger.info(`[External API] ${provider}`, payload);
  } else {
    logger.warn(`[External API] ${provider}`, payload);
  }
}

/**
 * @deprecated Prefer {@link logExternalApiResult} after the request completes so logs include outcome.
 * Still supported for gradual migration.
 */
export function logExternalApiCall(
  provider: ExternalApiProvider,
  operation: string,
  context?: Record<string, string | number | boolean | undefined>,
): void {
  logger.info(`[External API] ${provider}`, { operation, ...context });
}

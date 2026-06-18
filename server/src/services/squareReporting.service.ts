import {
  logExternalApiResult,
  truncateForExternalApiLog,
} from "../utils/externalApiCallLog.util.js";

const SQUARE_REPORTING_LOAD_URL = "https://connect.squareup.com/reporting/v1/load";
const DEFAULT_MAX_ATTEMPTS = 10;
const INITIAL_BACKOFF_MS = 500;

export interface SquareReportingLoadResult {
  data: Record<string, unknown>[];
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header?.trim()) return null;
  const asSeconds = Number.parseFloat(header);
  if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
    return Math.ceil(asSeconds * 1000);
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function formatReportingError(queryLabel: string, status: number, message: string): string {
  return `Square Reporting API error (${queryLabel}) ${status}: ${message}`;
}

/**
 * POST Square Reporting API /v1/load with Continue-wait retry and 429 handling.
 */
export async function loadSquareReportingQuery(
  accessToken: string,
  query: Record<string, unknown>,
  options: { maxAttempts?: number; queryName?: string } = {},
): Promise<SquareReportingLoadResult> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const queryLabel = options.queryName?.trim() || "reporting.load";
  let backoffMs = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(SQUARE_REPORTING_LOAD_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logExternalApiResult("Square", queryLabel, {
        outcome: "error",
        durationMs: Date.now() - started,
        error: truncateForExternalApiLog(message),
      });
      throw new Error(`Square Reporting API request failed (${queryLabel}): ${message}`);
    }

    const durationMs = Date.now() - started;
    const text = await res.text();
    let body: { data?: Record<string, unknown>[]; error?: string } = {};
    try {
      body = text ? (JSON.parse(text) as typeof body) : {};
    } catch {
      logExternalApiResult("Square", queryLabel, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        error: truncateForExternalApiLog(text || "Invalid JSON response"),
      });
      throw new Error(formatReportingError(queryLabel, res.status, "invalid JSON response"));
    }

    if (res.status === 429 && attempt < maxAttempts) {
      const retryMs = parseRetryAfterMs(res.headers.get("Retry-After")) ?? backoffMs;
      logExternalApiResult("Square", queryLabel, {
        outcome: "error",
        durationMs,
        httpStatus: 429,
        error: "Rate limited",
        attempt,
      });
      await sleep(retryMs);
      backoffMs = Math.min(backoffMs * 2, 8000);
      continue;
    }

    if (!res.ok) {
      const errMsg = body.error ?? text;
      logExternalApiResult("Square", queryLabel, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        error: truncateForExternalApiLog(errMsg),
      });
      throw new Error(formatReportingError(queryLabel, res.status, errMsg));
    }

    if (body.error === "Continue wait" && attempt < maxAttempts) {
      logExternalApiResult("Square", queryLabel, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        error: "Continue wait",
        attempt,
      });
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 8000);
      continue;
    }

    if (body.error && body.error !== "Continue wait") {
      logExternalApiResult("Square", queryLabel, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        error: truncateForExternalApiLog(body.error),
      });
      throw new Error(formatReportingError(queryLabel, res.status, body.error));
    }

    logExternalApiResult("Square", queryLabel, {
      outcome: "ok",
      durationMs,
      httpStatus: res.status,
      rowCount: Array.isArray(body.data) ? body.data.length : 0,
      attempt,
    });

    return {
      data: Array.isArray(body.data) ? body.data : [],
      ...(body.error ? { error: body.error } : {}),
    };
  }

  throw new Error(`Square Reporting API query timed out (${queryLabel}) after Continue wait retries.`);
}

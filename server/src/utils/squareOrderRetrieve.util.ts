import {
  logExternalApiResult,
  truncateForExternalApiLog,
} from "./externalApiCallLog.util.js";

const SQUARE_BASE = "https://connect.squareup.com";

export interface FetchSquareOrderByIdParams {
  orderId: string;
  token: string;
  /** Passed to logExternalApiResult `source` for traceability. */
  logSource: string;
}

interface SquareRetrieveOrderResponse {
  order?: Record<string, unknown>;
  errors?: Array<{ code: string; detail?: string }>;
}

/**
 * Retrieves a single Square order via `GET /v2/orders/{order_id}`.
 *
 * Returns the full `order` object on success, or `null` if Square returned a
 * non-2xx status or an `errors[]` body. Logs every outcome via
 * {@link logExternalApiResult}. Only throws on transport-level failures so
 * callers can decide whether to retry or skip persistence.
 */
export async function fetchSquareOrderById(
  params: FetchSquareOrderByIdParams,
): Promise<Record<string, unknown> | null> {
  const { orderId, token, logSource } = params;
  const op = "GET /v2/orders/{order_id}";
  const t0 = Date.now();

  let res: Response;
  try {
    res = await fetch(
      `${SQUARE_BASE}/v2/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
  } catch (e) {
    const durationMs = Date.now() - t0;
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      source: logSource,
      error: truncateForExternalApiLog(
        e instanceof Error ? e.message : String(e),
      ),
    });
    throw e;
  }
  const durationMs = Date.now() - t0;

  if (!res.ok) {
    const errText = await res.text();
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      source: logSource,
      error: truncateForExternalApiLog(errText),
    });
    return null;
  }

  const data = (await res.json()) as SquareRetrieveOrderResponse;
  const errors = data.errors;
  if (errors !== undefined && errors.length > 0) {
    const errMsg = errors.map((e) => e.detail ?? e.code).join("; ");
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      source: logSource,
      error: truncateForExternalApiLog(errMsg),
    });
    return null;
  }

  logExternalApiResult("Square", op, {
    outcome: "ok",
    durationMs,
    httpStatus: res.status,
    source: logSource,
  });

  return data.order ?? null;
}

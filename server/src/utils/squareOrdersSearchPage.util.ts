import {
  logExternalApiResult,
  truncateForExternalApiLog,
} from "./externalApiCallLog.util.js";

const SQUARE_BASE = "https://connect.squareup.com";

export type SquareOrdersSearchPageParams = {
  squareLocationId: string;
  startAt: string;
  endAt: string;
  cursor: string | undefined;
  token: string;
  /** Passed to logExternalApiResult `source`. */
  logSource: string;
};

export type SquareSearchOrdersPageResponse = {
  orders?: unknown[];
  cursor?: string;
  errors?: Array<{ code: string; detail?: string }>;
};

/**
 * One page of POST /v2/orders/search (created_at range, CREATED_AT DESC, limit 500).
 * Logs outcomes via {@link logExternalApiResult}; throws on transport/API failures.
 */
export async function fetchSquareOrdersSearchPage(
  params: SquareOrdersSearchPageParams,
): Promise<SquareSearchOrdersPageResponse> {
  const { squareLocationId, startAt, endAt, cursor, token, logSource } = params;

  const body: {
    location_ids: string[];
    query: {
      filter: {
        date_time_filter: {
          created_at: { start_at: string; end_at: string };
        };
      };
      sort: { sort_field: string; sort_order?: string };
    };
    limit: number;
    cursor?: string;
  } = {
    location_ids: [squareLocationId],
    query: {
      filter: {
        date_time_filter: {
          created_at: { start_at: startAt, end_at: endAt },
        },
      },
      sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
    },
    limit: 500,
  };
  if (cursor !== undefined && cursor !== "") {
    body.cursor = cursor;
  }

  const op = "POST /v2/orders/search";
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const durationMs = Date.now() - t0;
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      paginated: Boolean(cursor),
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
      paginated: Boolean(cursor),
      source: logSource,
      error: truncateForExternalApiLog(errText),
    });
    throw new Error(`Square API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as SquareSearchOrdersPageResponse;
  const errors = data.errors;
  if (errors !== undefined && errors.length > 0) {
    const errMsg = errors.map((e) => e.detail ?? e.code).join("; ");
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      paginated: Boolean(cursor),
      source: logSource,
      error: truncateForExternalApiLog(errMsg),
    });
    throw new Error(errMsg);
  }

  logExternalApiResult("Square", op, {
    outcome: "ok",
    durationMs,
    httpStatus: res.status,
    paginated: Boolean(cursor),
    source: logSource,
  });

  return data;
}

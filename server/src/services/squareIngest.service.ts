/**
 * Square REST calls used only for ingest / backfill (list payments, catalog search).
 * @see https://developer.squareup.com/reference/square
 */
import {
  logExternalApiResult,
  truncateForExternalApiLog,
} from "../utils/externalApiCallLog.util.js";

const SQUARE_BASE = "https://connect.squareup.com";

const CATALOG_OBJECT_TYPES = [
  "ITEM",
  "ITEM_VARIATION",
  "CATEGORY",
  "MODIFIER_LIST",
  "MODIFIER",
  "TAX",
  "DISCOUNT",
] as const;

export interface SquarePaymentListItem {
  id?: string;
  [key: string]: unknown;
}

interface ListPaymentsResponse {
  payments?: SquarePaymentListItem[];
  cursor?: string;
  errors?: Array<{ code: string; detail?: string }>;
}

/**
 * List payments for a location in [beginTime, endTime] (RFC 3339).
 */
export async function listPaymentsInRange(
  accessToken: string,
  squareLocationId: string,
  beginTime: string,
  endTime: string,
): Promise<SquarePaymentListItem[]> {
  const token = accessToken.trim();
  const all: SquarePaymentListItem[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${SQUARE_BASE}/v2/payments`);
    url.searchParams.set("begin_time", beginTime);
    url.searchParams.set("end_time", endTime);
    url.searchParams.set("location_id", squareLocationId);
    url.searchParams.set("sort_order", "DESC");
    if (cursor) url.searchParams.set("cursor", cursor);

    const op = "GET /v2/payments";
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        paginated: Boolean(cursor),
        error: truncateForExternalApiLog(
          e instanceof Error ? e.message : String(e),
        ),
      });
      throw e;
    }
    const durationMs = Date.now() - t0;

    const text = await res.text();
    if (!res.ok) {
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        error: truncateForExternalApiLog(text),
      });
      throw new Error(`Square ListPayments error ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as ListPaymentsResponse;
    if (data.errors?.length) {
      const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        error: truncateForExternalApiLog(errMsg),
      });
      throw new Error(`Square ListPayments errors: ${errMsg}`);
    }
    logExternalApiResult("Square", op, {
      outcome: "ok",
      durationMs,
      httpStatus: res.status,
      paginated: Boolean(cursor),
    });
    if (data.payments?.length) all.push(...data.payments);
    cursor = data.cursor;
  } while (cursor);

  return all;
}

interface CatalogSearchResponse {
  objects?: Array<Record<string, unknown>>;
  cursor?: string;
  errors?: Array<{ code: string; detail?: string }>;
}

/**
 * Paginate POST /v2/catalog/search for all configured object types.
 */
export async function searchCatalogObjects(
  accessToken: string,
): Promise<Array<Record<string, unknown>>> {
  const token = accessToken.trim();
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;

  do {
    const body: {
      object_types: string[];
      include_deleted_objects: boolean;
      include_related_objects: boolean;
      cursor?: string;
    } = {
      object_types: [...CATALOG_OBJECT_TYPES],
      include_deleted_objects: false,
      include_related_objects: true,
    };
    if (cursor) body.cursor = cursor;

    const op = "POST /v2/catalog/search";
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${SQUARE_BASE}/v2/catalog/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        paginated: Boolean(cursor),
        error: truncateForExternalApiLog(
          e instanceof Error ? e.message : String(e),
        ),
      });
      throw e;
    }
    const durationMs = Date.now() - t0;

    const text = await res.text();
    if (!res.ok) {
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        error: truncateForExternalApiLog(text),
      });
      throw new Error(`Square CatalogSearch error ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as CatalogSearchResponse;
    if (data.errors?.length) {
      const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        error: truncateForExternalApiLog(errMsg),
      });
      throw new Error(`Square CatalogSearch errors: ${errMsg}`);
    }
    logExternalApiResult("Square", op, {
      outcome: "ok",
      durationMs,
      httpStatus: res.status,
      paginated: Boolean(cursor),
    });
    if (data.objects?.length) all.push(...data.objects);
    cursor = data.cursor;
  } while (cursor);

  return all;
}

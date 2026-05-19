/**
 * Cache-key normalization and hashing for `DashboardCache`.
 *
 * Goals:
 *  - Deterministic: same params (in any object order, with undefineds present
 *    or absent) produce the same key.
 *  - Compact: short enough for a Mongo index, stable enough to inspect by eye.
 *  - Stable across deploys: no JSON.stringify of unsorted objects.
 */
import crypto from "node:crypto";

/** Names of all cached dashboard endpoints. Keep in sync with controller handlers. */
export type DashboardEndpoint =
  | "sales-labor.sales-trend"
  | "sales-labor.sales-trend-kpi"
  | "sales-labor.sales-by-category"
  | "sales-labor.kpis"
  | "sales-labor.hourly-breakdown"
  | "sales-labor.timesheet"
  | "command-center.kpis"
  | "command-center.hourly-sales"
  | "command-center.alerts";

export const ALL_DASHBOARD_ENDPOINTS: ReadonlyArray<DashboardEndpoint> = [
  "sales-labor.sales-trend",
  "sales-labor.sales-trend-kpi",
  "sales-labor.sales-by-category",
  "sales-labor.kpis",
  "sales-labor.hourly-breakdown",
  "sales-labor.timesheet",
  "command-center.kpis",
  "command-center.hourly-sales",
  "command-center.alerts",
];

/**
 * Sort keys, drop undefineds + empty strings, recursively normalize arrays
 * (sorted by JSON repr) so the same logical params always hash the same way.
 */
function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    const normalized = value
      .map(normalizeValue)
      .filter((v) => v !== undefined);
    return [...normalized].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const k of keys) {
      const v = normalizeValue((value as Record<string, unknown>)[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value;
}

export function normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const result = normalizeValue(params);
  return (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
}

/** Short, stable hash for use as the `paramsHash` segment. */
export function hashParams(normalized: Record<string, unknown>): string {
  const json = JSON.stringify(normalized);
  return crypto.createHash("sha1").update(json).digest("hex").slice(0, 16);
}

/**
 * Compose the deterministic cache key. The shape
 * `{endpoint}|{locationScope}|{paramsHash}` is human-readable and indexable.
 */
export function buildCacheKey(parts: {
  endpoint: DashboardEndpoint;
  locationScope: string;
  paramsHash: string;
}): string {
  return `${parts.endpoint}|${parts.locationScope}|${parts.paramsHash}`;
}

/**
 * One-shot helper: normalize, hash, and build the key in one call.
 * Returns both the key and the normalized params (the cron will store the
 * normalized form so it can rebuild later without re-normalizing).
 */
export function buildCacheKeyFromParams(input: {
  endpoint: DashboardEndpoint;
  locationScope: string;
  params: Record<string, unknown>;
}): { cacheKey: string; paramsHash: string; normalizedParams: Record<string, unknown> } {
  const normalizedParams = normalizeParams(input.params);
  const paramsHash = hashParams(normalizedParams);
  const cacheKey = buildCacheKey({
    endpoint: input.endpoint,
    locationScope: input.locationScope,
    paramsHash,
  });
  return { cacheKey, paramsHash, normalizedParams };
}

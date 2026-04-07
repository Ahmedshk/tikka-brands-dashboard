/**
 * When true, dashboard read paths that still consult this flag (e.g. MarketMan /
 * inventory) use Mongo-backed integration data instead of live APIs where implemented.
 * Square and Homebase labor/timecard metrics for dashboard pages always read from
 * Mongo synced collections when a location id is present; sync runners still call
 * vendor APIs to populate those collections.
 * Default is on; set EXTERNAL_DATA_CACHE_READ=0 or false for features that check
 * this flag for non-Square/non-Homebase reads.
 */
export function isExternalDataCacheReadEnabled(): boolean {
  const v = process.env.EXTERNAL_DATA_CACHE_READ?.trim().toLowerCase();
  if (v === "" || v === undefined) return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

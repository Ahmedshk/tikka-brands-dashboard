/**
 * Rollup-aware reader for `HomebaseTimecardHourlyRollup`. Kept separate from
 * the builder service (`homebaseTimecardHourlyRollup.service.ts`) so this file
 * has no imports from `integrationCacheRead.service.ts` — that file is where
 * the reader is consumed from, and a same-file pair would create a cycle.
 */
import type { TimeRange } from "../utils/businessHours.util.js";
import {
  businessDateKeysIntersectingUtcRange,
  businessDayUtcRangeIsoStrings,
} from "../utils/businessDayUtcRange.util.js";
import { loadHomebaseTimecardHourlyRollupsForDates } from "../utils/homebaseTimecardHourlyRollupLoader.util.js";
import { loadHomebaseTimecardDailyRollupsForDates } from "../utils/dailyRollupLoader.util.js";

const ROLLUP_READ_ENABLED =
  (process.env.ROLLUP_READ_ENABLED ?? "true").trim().toLowerCase() !== "false";

/**
 * Inline copy of the `fullBusinessDaysCoveredByRange` predicate used by
 * Square's rollup reader — duplicated here (private to that file) to avoid
 * widening that service's exported surface. If the shape ever diverges, lift
 * both copies into the util module.
 */
function fullBusinessDaysCoveredByRange(
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): string[] {
  const startMs = new Date(range.startAt).getTime();
  const endMs = new Date(range.endAt).getTime();
  const keys = businessDateKeysIntersectingUtcRange(
    range.startAt,
    range.endAt,
    timezone,
    businessStartTime,
  );
  const full: string[] = [];
  for (const key of keys) {
    const { startAt, endAt } = businessDayUtcRangeIsoStrings(
      timezone,
      businessStartTime,
      key,
    );
    const rs = new Date(startAt).getTime();
    const re = new Date(endAt).getTime();
    if (startMs <= rs && re <= endMs) full.push(key);
  }
  return full;
}

/**
 * Try to assemble the 24-slot labor cost array entirely from rollup rows.
 *
 * Returns null when:
 *   - `ROLLUP_READ_ENABLED` is off
 *   - the range doesn't cover any full business days (e.g. partial intraday)
 *   - **any** required day is missing rollup rows (caller falls back to a
 *     timecard scan for the full range — splitting it would risk
 *     double-counting open timecards that span day boundaries)
 *
 * On hit, sums labor cost per slot across all days in range. This matches
 * what `computeLaborCostPerHourFromTimecards` does when summing raw timecards.
 */
export async function tryGetHourlyLaborCostFromRollups(
  locationMongoId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<number[] | null> {
  if (!ROLLUP_READ_ENABLED) return null;
  const keys = fullBusinessDaysCoveredByRange(range, timezone, businessStartTime);
  if (keys.length === 0) return null;
  // Cache-aware loader: the all-locations bulk prefetch populates this in one
  // `$in` query so per-location workers hit in-process state instead of
  // round-tripping Mongo per call.
  const byDate = await loadHomebaseTimecardHourlyRollupsForDates(
    locationMongoId,
    keys,
  );
  // Require complete coverage for every requested day. If any day has fewer
  // than 24 rows, treat the whole range as a miss so the caller scans
  // timecards once instead of mixing partial rollup data with a sub-range scan.
  for (const key of keys) {
    const rows = byDate.get(key);
    if (!rows || rows.length < 24) return null;
  }

  // Staleness guard: older rollup rows were written by a broken proration that
  // always used "today's" slot bounds, so any non-today day ended up stored
  // as 24 zeros. The daily rollup uses a different (correct) code path, so
  // when its total disagrees with the sum of the hourly slots we know the
  // hourly rows are stale and force a miss — the caller will rescan raw
  // timecards through the fixed proration and the next builder run will
  // overwrite the bad rows.
  const dailyRollups = await loadHomebaseTimecardDailyRollupsForDates(
    locationMongoId,
    keys,
  );
  const dailyByKey = new Map<string, number>();
  for (const d of dailyRollups) {
    dailyByKey.set(d.businessDateKey, d.totalLaborCost ?? 0);
  }
  for (const key of keys) {
    const rows = byDate.get(key) ?? [];
    let hourlySum = 0;
    for (const r of rows) hourlySum += r.laborCost ?? 0;
    const dailyTotal = dailyByKey.get(key) ?? 0;
    // Treat anything above 1¢ rounding as a real discrepancy.
    if (dailyTotal > 0.01 && hourlySum < 0.01) {
      return null;
    }
  }

  const result = new Array<number>(24).fill(0);
  for (const key of keys) {
    const rows = byDate.get(key) ?? [];
    for (const r of rows) {
      const i = r.slotIndex;
      if (i >= 0 && i < 24) result[i] = (result[i] ?? 0) + (r.laborCost ?? 0);
    }
  }
  return result;
}

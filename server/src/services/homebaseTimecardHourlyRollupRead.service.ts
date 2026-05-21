/**
 * Rollup-aware reader for `HomebaseTimecardHourlyRollup`. Kept separate from
 * the builder service (`homebaseTimecardHourlyRollup.service.ts`) so this file
 * has no imports from `integrationCacheRead.service.ts` — that file is where
 * the reader is consumed from, and a same-file pair would create a cycle.
 */
import mongoose from "mongoose";
import { HomebaseTimecardHourlyRollupModel } from "../models/homebaseTimecardHourlyRollup.model.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import {
  businessDateKeysIntersectingUtcRange,
  businessDayUtcRangeIsoStrings,
} from "../utils/businessDayUtcRange.util.js";

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
  const oid = new mongoose.Types.ObjectId(locationMongoId);
  const docs = await HomebaseTimecardHourlyRollupModel.find({
    locationId: oid,
    businessDateKey: { $in: keys },
  })
    .lean()
    .exec();
  if (docs.length === 0) return null;
  // Require complete coverage for every requested day. If any day has fewer
  // than 24 rows, treat the whole range as a miss so the caller scans
  // timecards once instead of mixing partial rollup data with a sub-range scan.
  const rowsByDay = new Map<string, number>();
  for (const doc of docs) {
    rowsByDay.set(doc.businessDateKey, (rowsByDay.get(doc.businessDateKey) ?? 0) + 1);
  }
  for (const key of keys) {
    if ((rowsByDay.get(key) ?? 0) < 24) return null;
  }
  const result = new Array<number>(24).fill(0);
  for (const doc of docs) {
    const idx = doc.slotIndex;
    if (idx < 0 || idx >= 24) continue;
    result[idx] = (result[idx] ?? 0) + (doc.laborCost ?? 0);
  }
  return result;
}

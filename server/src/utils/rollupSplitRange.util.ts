/**
 * Split-range helpers for "use rollups for past days, scan raw for missing
 * portions" reads.
 *
 * Many of our daily-rollup readers used to be strict all-or-nothing: if any
 * business day in the requested range was missing a rollup row, the caller
 * fell back to scanning raw orders/timecards for the **entire** range. That
 * is expensive for ranges like "week-to-date" where only today (or a few
 * historical days for newly-onboarded locations) lack rollup rows.
 *
 * `computeRollupUncoveredSubRanges` returns the time sub-ranges that the
 * caller must still scan from raw data after summing whatever rollup rows
 * are present. The caller adds rollup totals + raw-scan totals for each
 * sub-range to produce the final answer.
 *
 * Properties:
 *  - Returns the smallest set of contiguous sub-ranges (contiguous days are
 *    merged into a single range so the caller issues one query per gap).
 *  - Includes any leading/trailing partial fragment of the original range
 *    that does not fully cover a business day (typically "today" so far).
 *  - Returns `[range]` unchanged when there is nothing to gain from rollups
 *    (no day in range is both fully covered AND present in rollups).
 *  - Returns `[]` when every business day in the range is fully covered by
 *    the range AND present in rollups (the pure rollup-hit case).
 */
import type { TimeRange } from "./businessHours.util.js";
import {
  businessDateKeysIntersectingUtcRange,
  businessDayUtcRangeIsoStrings,
} from "./businessDayUtcRange.util.js";

export function computeRollupUncoveredSubRanges(
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  presentKeys: ReadonlySet<string>,
): TimeRange[] {
  const allKeys = businessDateKeysIntersectingUtcRange(
    range.startAt,
    range.endAt,
    timezone,
    businessStartTime,
  );
  if (allKeys.length === 0) return [range];

  const rangeStartMs = new Date(range.startAt).getTime();
  const rangeEndMs = new Date(range.endAt).getTime();

  const dayWindows = allKeys
    .map((key) => {
      const { startAt, endAt } = businessDayUtcRangeIsoStrings(
        timezone,
        businessStartTime,
        key,
      );
      return {
        key,
        dayStartMs: new Date(startAt).getTime(),
        dayEndMs: new Date(endAt).getTime(),
      };
    })
    .sort((a, b) => a.dayStartMs - b.dayStartMs);

  const uncoveredMs: { startMs: number; endMs: number }[] = [];
  for (const { key, dayStartMs, dayEndMs } of dayWindows) {
    const overlapStartMs = Math.max(rangeStartMs, dayStartMs);
    const overlapEndMs = Math.min(rangeEndMs, dayEndMs);
    if (overlapEndMs <= overlapStartMs) continue;
    const fullyCovered =
      rangeStartMs <= dayStartMs && dayEndMs <= rangeEndMs;
    if (fullyCovered && presentKeys.has(key)) continue;
    uncoveredMs.push({ startMs: overlapStartMs, endMs: overlapEndMs });
  }

  if (uncoveredMs.length === 0) return [];

  const merged: { startMs: number; endMs: number }[] = [];
  for (const slot of uncoveredMs) {
    const tail = merged.at(-1);
    if (tail != null && slot.startMs <= tail.endMs + 1) {
      tail.endMs = Math.max(tail.endMs, slot.endMs);
    } else {
      merged.push({ startMs: slot.startMs, endMs: slot.endMs });
    }
  }

  return merged.map((slot) => ({
    startAt: new Date(slot.startMs).toISOString(),
    endAt: new Date(slot.endMs).toISOString(),
  }));
}

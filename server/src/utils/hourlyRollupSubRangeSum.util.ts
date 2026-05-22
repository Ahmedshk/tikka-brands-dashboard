/**
 * Sum hourly-rollup slot rows for an arbitrary sub-range.
 *
 * The Sales & Labor daily-rollup split returns "uncovered sub-ranges" — the
 * portions of a query range not fully covered by a complete daily rollup
 * (typically: today's partial day for periods that include today). The old
 * fallback was to scan raw `SquareOrder` / `HomebaseTimecard` documents for
 * those sub-ranges, which dominated wall time when the sub-range spanned
 * many orders.
 *
 * These helpers sum the hourly-granularity rollups instead. They:
 *   - Iterate every business day the sub-range touches
 *   - Require each touched day to have a complete (24-slot) hourly rollup;
 *     if any day is missing, return `null` so the caller can fall through
 *     to the tertiary raw-scan path
 *   - Add a slot's value when the slot's `[start, end)` window overlaps the
 *     sub-range. The slot itself is the smallest unit we have, so the
 *     trailing in-progress slot is included whole — same staleness/precision
 *     trade-off as the existing rollup paths.
 *
 * Locations of the data:
 *   - {@link SquareOrderHourlyRollup}: `netSalesCents`, `transactionCount`,
 *     and per-source `sourcesOfSales` (used by KPI cards + sales trend).
 *   - {@link HomebaseTimecardHourlyRollup}: `laborCost` only. Hours are not
 *     in the hourly rollup, so the labor-hours read path keeps its raw
 *     fallback for the partial-day case (until we add `paidHours` to the
 *     hourly model + backfill it).
 */
import type { TimeRange } from "./businessHours.util.js";
import {
  businessDateKeysIntersectingUtcRange,
  getBusinessHourSlotBoundsForBusinessDateKey,
} from "./businessDayUtcRange.util.js";
import { loadSquareOrderHourlyRollupsForDates } from "./hourlyRollupLoader.util.js";
import { loadHomebaseTimecardHourlyRollupsForDates } from "./homebaseTimecardHourlyRollupLoader.util.js";
import { sumSourcesOfSalesSegmentsToCentsById } from "./squareSourcesOfSalesMerge.util.js";

/**
 * Slot overlaps a sub-range when their `[start, end)` windows share any time.
 * Hourly rollup slots are stored with an inclusive `endAt` (e.g. `:59:59.999`)
 * so we treat slot windows as `[startMs, endMs+1)` for the overlap check.
 */
function slotOverlapsSubRange(
  slotStartMs: number,
  slotEndMs: number,
  subRangeStartMs: number,
  subRangeEndMs: number,
): boolean {
  return slotEndMs + 1 > subRangeStartMs && slotStartMs < subRangeEndMs;
}

/**
 * Square — sum hourly rollups for `subRange`. Returns null when any day
 * touched by the sub-range lacks a complete (24-row) hourly rollup, so
 * callers can fall back to a raw `SquareOrder` scan for that sub-range.
 *
 * The returned `sourcesOfSalesCentsById` is keyed exactly like
 * `tryGetOrderStatsAndSourcesFromDailyRollupsSplit`'s output so the caller
 * can merge the two maps without further reshaping.
 */
export async function tryGetSquareOrderStatsFromHourlyRollupsForSubRange(
  locationMongoId: string,
  subRange: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<{
  netSalesCents: number;
  transactionCount: number;
  sourcesOfSalesCentsById: Map<string, number>;
} | null> {
  const dateKeys = businessDateKeysIntersectingUtcRange(
    subRange.startAt,
    subRange.endAt,
    timezone,
    businessStartTime,
  );
  if (dateKeys.length === 0) return null;

  const subRangeStartMs = new Date(subRange.startAt).getTime();
  const subRangeEndMs = new Date(subRange.endAt).getTime();

  const byDate = await loadSquareOrderHourlyRollupsForDates(
    locationMongoId,
    dateKeys,
  );

  // Each day must have a full 24-slot rollup; otherwise we'd silently
  // under-count for that day and the dashboard would diverge from reality.
  for (const key of dateKeys) {
    const rows = byDate.get(key);
    if (!rows || rows.length < 24) return null;
  }

  let netSalesCents = 0;
  let transactionCount = 0;
  const sourcesOfSalesCentsById = new Map<string, number>();

  for (const key of dateKeys) {
    const rows = byDate.get(key) ?? [];
    for (const row of rows) {
      const { startAt, endAt } = getBusinessHourSlotBoundsForBusinessDateKey(
        timezone,
        businessStartTime,
        key,
        row.slotIndex,
      );
      const slotStartMs = new Date(startAt).getTime();
      const slotEndMs = new Date(endAt).getTime();
      if (!slotOverlapsSubRange(slotStartMs, slotEndMs, subRangeStartMs, subRangeEndMs)) {
        continue;
      }
      netSalesCents += row.netSalesCents ?? 0;
      transactionCount += row.transactionCount ?? 0;
      for (const [id, cents] of sumSourcesOfSalesSegmentsToCentsById(
        row.sourcesOfSales,
      )) {
        sourcesOfSalesCentsById.set(
          id,
          (sourcesOfSalesCentsById.get(id) ?? 0) + cents,
        );
      }
    }
  }

  return { netSalesCents, transactionCount, sourcesOfSalesCentsById };
}

/**
 * Homebase — sum hourly labor-cost rollups for `subRange`. Returns null when
 * any day lacks a complete (24-row) rollup so the caller can fall back to a
 * raw timecard scan.
 *
 * Hours are NOT in the Homebase hourly rollup model, so this helper covers
 * labor cost only. The hours read path keeps its raw fallback for partial
 * days until `paidHours` is added to the hourly schema + backfilled.
 */
export async function tryGetHomebaseLaborCostFromHourlyRollupsForSubRange(
  locationMongoId: string,
  subRange: TimeRange,
  timezone: string,
  businessStartTime: string,
): Promise<number | null> {
  const dateKeys = businessDateKeysIntersectingUtcRange(
    subRange.startAt,
    subRange.endAt,
    timezone,
    businessStartTime,
  );
  if (dateKeys.length === 0) return null;

  const subRangeStartMs = new Date(subRange.startAt).getTime();
  const subRangeEndMs = new Date(subRange.endAt).getTime();

  const byDate = await loadHomebaseTimecardHourlyRollupsForDates(
    locationMongoId,
    dateKeys,
  );
  for (const key of dateKeys) {
    const rows = byDate.get(key);
    if (!rows || rows.length < 24) return null;
  }

  let laborCost = 0;
  for (const key of dateKeys) {
    const rows = byDate.get(key) ?? [];
    for (const row of rows) {
      const { startAt, endAt } = getBusinessHourSlotBoundsForBusinessDateKey(
        timezone,
        businessStartTime,
        key,
        row.slotIndex,
      );
      const slotStartMs = new Date(startAt).getTime();
      const slotEndMs = new Date(endAt).getTime();
      if (!slotOverlapsSubRange(slotStartMs, slotEndMs, subRangeStartMs, subRangeEndMs)) {
        continue;
      }
      laborCost += row.laborCost ?? 0;
    }
  }
  return laborCost;
}

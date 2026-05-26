/**
 * Helpers for Homebase labor cost per hour. Extracted to keep cognitive complexity low.
 */
import {
  businessDateKeyForInstant,
  getBusinessHourSlotBoundsForBusinessDateKey,
} from "./businessDayUtcRange.util.js";

export interface TimecardForLaborCost {
  labor?: { costs?: number };
  clock_in?: string;
  clock_out?: string | null;
}

/**
 * Prorate one timecard's labor cost across 24 business-hour slots by overlap.
 * Returns 24 numbers. endAtMs is used when clock_out is missing.
 *
 * Slot bounds must come from the timecard's OWN business date key — the
 * previous implementation used `getBusinessHourSlotBounds` (which always
 * resolves to "today"), so any timecard whose clock-in didn't fall inside
 * today's business-day window had zero overlap on every slot and contributed
 * 0 dollars. That bug zeroed out the hourly labor rollup for every past day
 * and made the dashboard's hourly labor cost chart flatline at 0 for
 * anything other than the in-progress business day.
 */
function getTimecardSlotContributions(
  tc: TimecardForLaborCost,
  endAtMs: number,
  tz: string,
  bizStart: string,
): number[] {
  const costs = tc.labor?.costs;
  if (typeof costs !== "number" || !Number.isFinite(costs)) {
    return new Array<number>(24).fill(0);
  }
  const clockIn = tc.clock_in ? new Date(tc.clock_in).getTime() : Number.NaN;
  const clockOut = tc.clock_out ? new Date(tc.clock_out).getTime() : Number.NaN;
  if (Number.isNaN(clockIn)) return new Array<number>(24).fill(0);
  const endMs = Number.isNaN(clockOut) ? endAtMs : clockOut;
  const totalMs = Math.max(0, endMs - clockIn);
  if (totalMs <= 0) return new Array<number>(24).fill(0);

  // Resolve slot bounds against the timecard's own business date so the
  // overlap math is meaningful regardless of which day(s) the requested
  // range covers. Shifts that cross a business-day boundary still attribute
  // their cost using the bounds of the day they clocked in on — same
  // assumption the daily rollup makes.
  const businessDateKey = businessDateKeyForInstant(
    new Date(clockIn),
    tz,
    bizStart,
  );

  const contributions = new Array<number>(24).fill(0);
  for (let slot = 0; slot < 24; slot++) {
    const { startAt: slotStartAt, endAt: slotEndAt } =
      getBusinessHourSlotBoundsForBusinessDateKey(
        tz,
        bizStart,
        businessDateKey,
        slot,
      );
    const slotStartMs = new Date(slotStartAt).getTime();
    const slotEndMs = new Date(slotEndAt).getTime() + 1;
    const overlapStart = Math.max(clockIn, slotStartMs);
    const overlapEnd = Math.min(endMs, slotEndMs);
    const overlapMs = Math.max(0, overlapEnd - overlapStart);
    if (overlapMs > 0) {
      contributions[slot] = (overlapMs / totalMs) * costs;
    }
  }
  return contributions;
}

/**
 * Prorate timecards' labor cost across business-hour slots. Returns 24 numbers (dollars per slot).
 */
export function computeLaborCostPerHourFromTimecards(
  timecards: TimecardForLaborCost[],
  endAt: string,
  timezone: string,
  businessStartTime: string,
): number[] {
  const result = new Array<number>(24).fill(0);
  const tz = timezone.trim();
  const bizStart = businessStartTime?.trim() ?? "00:00";
  const endAtMs = new Date(endAt).getTime();

  for (const tc of timecards) {
    const contrib = getTimecardSlotContributions(tc, endAtMs, tz, bizStart);
    for (let slot = 0; slot < 24; slot++) {
      result[slot] = (result[slot] ?? 0) + (contrib[slot] ?? 0);
    }
  }

  return result;
}

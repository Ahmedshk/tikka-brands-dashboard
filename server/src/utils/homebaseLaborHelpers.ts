/**
 * Helpers for Homebase labor cost per hour. Extracted to keep cognitive complexity low.
 */
import { getBusinessHourSlotBounds } from "./businessDayUtcRange.util.js";

export interface TimecardForLaborCost {
  labor?: { costs?: number };
  clock_in?: string;
  clock_out?: string | null;
}

/**
 * Prorate one timecard's labor cost across 24 business-hour slots by overlap.
 * Returns 24 numbers. endAtMs is used when clock_out is missing.
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

  const contributions = new Array<number>(24).fill(0);
  for (let slot = 0; slot < 24; slot++) {
    const { startAt: slotStartAt, endAt: slotEndAt } =
      getBusinessHourSlotBounds(tz, bizStart, slot);
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

import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getZonedCalendarDayUtcBoundsForDateKey } from "./integrationSyncZonedDayBounds.util.js";

export const MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ = "America/Denver";

export type MarketManMonthlySyncWindow = {
  startDateKey: string;
  endDateKey: string;
  startDateIso: string;
  endDateIso: string;
  denverDateKey: string;
  denverMonthKey: string;
};

function denverCalendarParts(referenceUtc: Date): { year: number; month: number } {
  const year = Number(formatInTimeZone(referenceUtc, MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ, "yyyy"));
  const month = Number(formatInTimeZone(referenceUtc, MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ, "M"));
  return { year, month };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Shift a Denver calendar `yyyy-MM-dd` by `delta` days. */
export function shiftDenverDateKey(dateKey: string, delta: number): string {
  const noonUtc = fromZonedTime(`${dateKey}T12:00:00.000`, MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ);
  const shifted = addDays(noonUtc, delta);
  return formatInTimeZone(shifted, MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ, "yyyy-MM-dd");
}

/**
 * Padded two-month window in America/Denver:
 * - start = day before 1st of previous month
 * - end = day after last day of current month
 */
export function marketManMonthlySyncWindowDenver(
  referenceUtc: Date = new Date(),
): MarketManMonthlySyncWindow {
  const { year, month } = denverCalendarParts(referenceUtc);

  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const previousMonthStartKey = formatDateKey(prevYear, prevMonth, 1);
  const startDateKey = shiftDenverDateKey(previousMonthStartKey, -1);

  const lastDay = daysInMonth(year, month);
  const currentMonthLastKey = formatDateKey(year, month, lastDay);
  const endDateKey = shiftDenverDateKey(currentMonthLastKey, 1);

  const startBounds = getZonedCalendarDayUtcBoundsForDateKey(
    MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ,
    startDateKey,
  );
  const endBounds = getZonedCalendarDayUtcBoundsForDateKey(
    MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ,
    endDateKey,
  );

  return {
    startDateKey,
    endDateKey,
    startDateIso: startBounds.start.toISOString(),
    endDateIso: endBounds.end.toISOString(),
    denverDateKey: formatInTimeZone(referenceUtc, MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ, "yyyy-MM-dd"),
    denverMonthKey: formatInTimeZone(referenceUtc, MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ, "yyyy-MM"),
  };
}

export function scheduledMarketManOrdersDailyDedupeMessage(denverDateKey: string): string {
  return `scheduledDenverDateKey:${denverDateKey}`;
}

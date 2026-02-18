/**
 * Sales Trend date-range and granularity helpers.
 * All ranges are in location timezone (calendar days/hours).
 */

export type PeriodType =
  | "today"
  | "last7days"
  | "last30days"
  | "last52weeks"
  | "thisWeek"
  | "thisMonth"
  | "thisYear"
  | "custom";

export type ComparisonType =
  | "none"
  | "1DayPrior"
  | "samePeriodPreviousWeek"
  | "samePeriodPreviousMonth"
  | "priorYear"
  | "52WeeksPrior"
  | "year2Before"
  | "year3Before"
  | "year4Before"
  | "custom";

export type Granularity = "hourly" | "daily" | "weekly" | "monthly";

export interface PeriodRangeResult {
  startAt: string;
  endAt: string;
  granularity: Granularity;
  /** When set, chart x-axis and comparison use startAt..displayEndAt; current-period data is still startAt..endAt only. */
  displayEndAt?: string;
}

export interface ComparisonRangeResult {
  startAt: string;
  endAt: string;
}

/** Start of a calendar day in timezone as UTC Date (midnight in that TZ). Exported for TZ-aware monthly bucket iteration. */
export function getStartOfDayUtc(
  y: number,
  m: number,
  d: number,
  timezone: string,
): Date {
  const utcNoon = Date.UTC(y, m, d, 12, 0, 0, 0);
  const hourFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const hourStr = hourFormatter.format(utcNoon);
  const hour = Number.parseInt(hourStr.split(":")[0] ?? "0", 10);
  const offsetHours = hour - 12;
  return new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
}

/** Get (year, month 0-based, day) of "now" in the given timezone. */
function getTodayInTz(timezone: string): { y: number; m: number; d: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number.parseInt(get("year"), 10);
  const m = Number.parseInt(get("month"), 10) - 1;
  const d = Number.parseInt(get("day"), 10);
  return { y, m, d };
}

/** Add days to a calendar date (y, m, d), return new (y, m, d). */
function addDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const date = new Date(y, m, d + delta);
  return {
    y: date.getFullYear(),
    m: date.getMonth(),
    d: date.getDate(),
  };
}

/** End of day (23:59:59.999) in TZ for (y,m,d). */
function getEndOfDayUtc(
  y: number,
  m: number,
  d: number,
  timezone: string,
): Date {
  const start = getStartOfDayUtc(y, m, d, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

import {
  getBusinessStartTimeRange,
  getBusinessDayRangeForDate,
} from "./timezone.util.js";

/**
 * Get the period range and granularity for Sales Trend.
 * For "custom", periodStart and periodEnd must be provided (ISO date or YYYY-MM-DD).
 * For "today", pass businessStartTime so the period uses store business day (business start till 1s before next business start).
 */
export function getSalesTrendPeriodRange(
  periodType: PeriodType,
  timezone: string,
  customStart?: string,
  customEnd?: string,
  businessStartTime?: string,
): PeriodRangeResult {
  const tz = timezone.trim();
  const { y, m, d } = getTodayInTz(tz);

  if (periodType === "custom" && customStart && customEnd) {
    const startMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customStart.trim());
    const endMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customEnd.trim());
    if (!startMatch || !endMatch) {
      return getSalesTrendPeriodRange("last30days", tz);
    }
    const sy = Number.parseInt(startMatch[1]!, 10);
    const sm = Number.parseInt(startMatch[2]!, 10) - 1;
    const sd = Number.parseInt(startMatch[3]!, 10);
    const ey = Number.parseInt(endMatch[1]!, 10);
    const em = Number.parseInt(endMatch[2]!, 10) - 1;
    const ed = Number.parseInt(endMatch[3]!, 10);
    const bizStart = (businessStartTime ?? "00:00").trim();
    const useBusinessDay = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(bizStart);
    const endDayIsToday = ey === y && em === m && ed === d;
    const endOfToday = getEndOfDayUtc(y, m, d, tz);

    let startAt: string;
    let endAt: string;
    let displayEndAtIso: string | undefined;

    if (useBusinessDay) {
      const startRange = getBusinessDayRangeForDate(tz, bizStart, sy, sm, sd);
      startAt = startRange.startAt;
      const endRange = getBusinessDayRangeForDate(tz, bizStart, ey, em, ed);
      displayEndAtIso = endRange.endAt;
      endAt = endDayIsToday ? new Date().toISOString() : endRange.endAt;
    } else {
      startAt = getStartOfDayUtc(sy, sm, sd, tz).toISOString();
      const endOfEndDay = getEndOfDayUtc(ey, em, ed, tz);
      displayEndAtIso = endOfEndDay.toISOString();
      endAt = endDayIsToday
        ? (new Date().getTime() <= endOfToday.getTime()
            ? new Date().toISOString()
            : endOfToday.toISOString())
        : endOfEndDay.toISOString();
    }

    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    const isSingleDay = sy === ey && sm === em && sd === ed;
    const days = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
    let granularity: Granularity = "daily";
    if (isSingleDay || days <= 1) granularity = "hourly";
    else if (days > 90) granularity = "weekly";
    const withDisplayEnd =
      displayEndAtIso != null && endDayIsToday
        ? { displayEndAt: displayEndAtIso }
        : {};
    return {
      startAt,
      endAt,
      granularity,
      ...withDisplayEnd,
    };
  }

  switch (periodType) {
    case "today": {
      const bizStart = (businessStartTime ?? "00:00").trim();
      const useBusinessDay = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(bizStart);
      if (useBusinessDay) {
        const { startAt, endAt } = getBusinessStartTimeRange(tz, bizStart);
        return {
          startAt,
          endAt: new Date().toISOString(),
          granularity: "hourly",
          displayEndAt: endAt,
        };
      }
      const startDate = getStartOfDayUtc(y, m, d, tz);
      const displayEndDate = getEndOfDayUtc(y, m, d, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: new Date().toISOString(),
        granularity: "hourly",
        displayEndAt: displayEndDate.toISOString(),
      };
    }
    case "last7days": {
      const end = { y, m, d };
      const start = addDays(end.y, end.m, end.d, -6);
      const startDate = getStartOfDayUtc(start.y, start.m, start.d, tz);
      const endDate = getEndOfDayUtc(end.y, end.m, end.d, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "daily",
      };
    }
    case "last30days": {
      const end = addDays(y, m, d, -1);
      const start = addDays(end.y, end.m, end.d, -29);
      const startDate = getStartOfDayUtc(start.y, start.m, start.d, tz);
      const endDate = getEndOfDayUtc(end.y, end.m, end.d, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "daily",
      };
    }
    case "last52weeks": {
      const startMonth = new Date(y, m - 12, 1);
      const startY = startMonth.getFullYear();
      const startM = startMonth.getMonth();
      const startDate = getStartOfDayUtc(startY, startM, 1, tz);
      const lastDayOfCurrentMonth = new Date(y, m + 1, 0).getDate();
      const endDate = getEndOfDayUtc(y, m, lastDayOfCurrentMonth, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "monthly",
      };
    }
    case "thisWeek": {
      const date = new Date(y, m, d);
      const dayOfWeek = date.getDay();
      const toSunday = dayOfWeek;
      const start = addDays(y, m, d, -toSunday);
      const saturday = addDays(start.y, start.m, start.d, 6);
      const startDate = getStartOfDayUtc(start.y, start.m, start.d, tz);
      const endDate = getEndOfDayUtc(y, m, d, tz);
      const displayEndDate = getEndOfDayUtc(saturday.y, saturday.m, saturday.d, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "daily",
        displayEndAt: displayEndDate.toISOString(),
      };
    }
    case "thisMonth": {
      const startDate = getStartOfDayUtc(y, m, 1, tz);
      const endDate = getEndOfDayUtc(y, m, d, tz);
      const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
      const displayEndDate = getEndOfDayUtc(y, m, lastDayOfMonth, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "daily",
        displayEndAt: displayEndDate.toISOString(),
      };
    }
    case "thisYear": {
      const startDate = getStartOfDayUtc(y, 0, 1, tz);
      const endDate = getEndOfDayUtc(y, m, d, tz);
      const displayEndDate = getEndOfDayUtc(y, 11, 31, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "monthly",
        displayEndAt: displayEndDate.toISOString(),
      };
    }
    default:
      return getSalesTrendPeriodRange("last30days", tz);
  }
}

/** Get (year, month 0-based, day) of a date in the given timezone. Exported for TZ-aware monthly bucket iteration. */
export function getDatePartsInTz(date: Date, timezone: string): { y: number; m: number; d: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number.parseInt(get("year"), 10);
  const m = Number.parseInt(get("month"), 10) - 1;
  const d = Number.parseInt(get("day"), 10);
  return { y, m, d };
}

/**
 * Get the comparison period range given the primary period range and comparison type.
 * Returns same-length range aligned with comparison option; same granularity as primary.
 * For custom, pass customComparisonStart and customComparisonEnd (both ISO or YYYY-MM-DD).
 * Optional businessStartTime ensures custom comparison uses store business day boundaries.
 */
export function getSalesTrendComparisonRange(
  comparisonType: ComparisonType,
  periodStartAt: string,
  periodEndAt: string,
  timezone: string,
  customComparisonDate?: string,
  customComparisonStart?: string,
  customComparisonEnd?: string,
  businessStartTime?: string,
): ComparisonRangeResult | null {
  if (comparisonType === "none") return null;

  const tz = timezone.trim();
  const start = new Date(periodStartAt);
  const end = new Date(periodEndAt);
  const durationMs = end.getTime() - start.getTime();

  if (comparisonType === "custom") {
    if (customComparisonStart && customComparisonEnd) {
      const startMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customComparisonStart.trim());
      const endMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customComparisonEnd.trim());
      if (!startMatch || !endMatch) return null;
      const sy = Number.parseInt(startMatch[1]!, 10);
      const sm = Number.parseInt(startMatch[2]!, 10) - 1;
      const sd = Number.parseInt(startMatch[3]!, 10);
      const ey = Number.parseInt(endMatch[1]!, 10);
      const em = Number.parseInt(endMatch[2]!, 10) - 1;
      const ed = Number.parseInt(endMatch[3]!, 10);
      const bizStart = (businessStartTime ?? "00:00").trim();
      const useBusinessDay = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(bizStart);
      if (useBusinessDay) {
        const startRange = getBusinessDayRangeForDate(tz, bizStart, sy, sm, sd);
        const endRange = getBusinessDayRangeForDate(tz, bizStart, ey, em, ed);
        return { startAt: startRange.startAt, endAt: endRange.endAt };
      }
      return {
        startAt: getStartOfDayUtc(sy, sm, sd, tz).toISOString(),
        endAt: getEndOfDayUtc(ey, em, ed, tz).toISOString(),
      };
    }
    if (customComparisonDate) {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(customComparisonDate.trim());
      if (!match) return null;
      const refY = Number.parseInt(match[1]!, 10);
      const refM = Number.parseInt(match[2]!, 10) - 1;
      const refD = Number.parseInt(match[3]!, 10);
      const bizStart = (businessStartTime ?? "00:00").trim();
      const useBusinessDay = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(bizStart);
      const endRange = useBusinessDay
        ? getBusinessDayRangeForDate(tz, bizStart, refY, refM, refD)
        : {
            startAt: getStartOfDayUtc(refY, refM, refD, tz).toISOString(),
            endAt: getEndOfDayUtc(refY, refM, refD, tz).toISOString(),
          };
      const endMs = new Date(endRange.endAt).getTime();
      const startMs = endMs - durationMs;
      return {
        startAt: new Date(startMs).toISOString(),
        endAt: endRange.endAt,
      };
    }
    return null;
  }

  switch (comparisonType) {
    case "1DayPrior": {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const startRef = new Date(start.getTime() - oneDayMs);
      const endRef = new Date(end.getTime() - oneDayMs);
      return {
        startAt: startRef.toISOString(),
        endAt: endRef.toISOString(),
      };
    }
    case "samePeriodPreviousWeek": {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const startRef = new Date(start.getTime() - oneWeekMs);
      const endRef = new Date(end.getTime() - oneWeekMs);
      return {
        startAt: startRef.toISOString(),
        endAt: endRef.toISOString(),
      };
    }
    case "samePeriodPreviousMonth": {
      const startRef = new Date(start);
      startRef.setUTCMonth(startRef.getUTCMonth() - 1);
      const endRef = new Date(end);
      endRef.setUTCMonth(endRef.getUTCMonth() - 1);
      return {
        startAt: startRef.toISOString(),
        endAt: endRef.toISOString(),
      };
    }
    case "priorYear": {
      const startRef = new Date(start);
      startRef.setUTCFullYear(startRef.getUTCFullYear() - 1);
      const endRef = new Date(end);
      endRef.setUTCFullYear(endRef.getUTCFullYear() - 1);
      return {
        startAt: startRef.toISOString(),
        endAt: endRef.toISOString(),
      };
    }
    case "52WeeksPrior": {
      const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      if (durationDays > 360) {
        const startRef = new Date(start);
        startRef.setUTCMonth(startRef.getUTCMonth() - 12);
        const endRef = new Date(end);
        endRef.setUTCMonth(endRef.getUTCMonth() - 12);
        return {
          startAt: startRef.toISOString(),
          endAt: endRef.toISOString(),
        };
      }
      const fiftyTwoWeeksMs = 52 * 7 * 24 * 60 * 60 * 1000;
      const startRef = new Date(start.getTime() - fiftyTwoWeeksMs);
      const endRef = new Date(end.getTime() - fiftyTwoWeeksMs);
      return {
        startAt: startRef.toISOString(),
        endAt: endRef.toISOString(),
      };
    }
    case "year2Before":
    case "year3Before":
    case "year4Before": {
      const parts = getDatePartsInTz(end, tz);
      const n = comparisonType === "year2Before" ? 2 : comparisonType === "year3Before" ? 3 : 4;
      const targetYear = parts.y - n;
      const startDate = getStartOfDayUtc(targetYear, 0, 1, tz);
      const endDate = getEndOfDayUtc(targetYear, 11, 31, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
      };
    }
    default:
      return null;
  }
}

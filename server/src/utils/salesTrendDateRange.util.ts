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

/** Day of week (0 = Sunday, 6 = Saturday) for calendar date (y, m, d) in the given timezone. */
function getDayOfWeekInTz(
  y: number,
  m: number,
  d: number,
  timezone: string,
): number {
  const startOfDay = getStartOfDayUtc(y, m, d, timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekday = formatter.format(startOfDay);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
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
export function getEndOfDayUtc(
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
      const bizStart = (businessStartTime ?? "00:00").trim();
      if (useBusinessDayBoundaries(businessStartTime)) {
        const startRange = getBusinessDayRangeForDate(tz, bizStart, start.y, start.m, start.d);
        const endRange = getBusinessDayRangeForDate(tz, bizStart, end.y, end.m, end.d);
        return {
          startAt: startRange.startAt,
          endAt: endRange.endAt,
          granularity: "daily",
        };
      }
      const startDate = getStartOfDayUtc(start.y, start.m, start.d, tz);
      const endDate = getEndOfDayUtc(end.y, end.m, end.d, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "daily",
      };
    }
    case "last30days": {
      const end = { y, m, d };
      const start = addDays(end.y, end.m, end.d, -29);
      const bizStart = (businessStartTime ?? "00:00").trim();
      if (useBusinessDayBoundaries(businessStartTime)) {
        const startRange = getBusinessDayRangeForDate(tz, bizStart, start.y, start.m, start.d);
        const endRange = getBusinessDayRangeForDate(tz, bizStart, end.y, end.m, end.d);
        return {
          startAt: startRange.startAt,
          endAt: endRange.endAt,
          granularity: "daily",
        };
      }
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
      const lastDayOfCurrentMonth = new Date(y, m + 1, 0).getDate();
      const bizStart = (businessStartTime ?? "00:00").trim();
      if (useBusinessDayBoundaries(businessStartTime)) {
        const startRange = getBusinessDayRangeForDate(tz, bizStart, startY, startM, 1);
        const endRange = getBusinessDayRangeForDate(tz, bizStart, y, m, lastDayOfCurrentMonth);
        return {
          startAt: startRange.startAt,
          endAt: endRange.endAt,
          granularity: "monthly",
        };
      }
      const startDate = getStartOfDayUtc(startY, startM, 1, tz);
      const endDate = getEndOfDayUtc(y, m, lastDayOfCurrentMonth, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "monthly",
      };
    }
    case "thisWeek": {
      const dayOfWeek = getDayOfWeekInTz(y, m, d, tz);
      const toSunday = dayOfWeek;
      const start = addDays(y, m, d, -toSunday);
      const saturday = addDays(start.y, start.m, start.d, 6);
      const bizStart = (businessStartTime ?? "00:00").trim();
      if (useBusinessDayBoundaries(businessStartTime)) {
        const startRange = getBusinessDayRangeForDate(tz, bizStart, start.y, start.m, start.d);
        const satEndRange = getBusinessDayRangeForDate(tz, bizStart, saturday.y, saturday.m, saturday.d);
        const now = new Date();
        const satEndMs = new Date(satEndRange.endAt).getTime();
        const endAt = now.getTime() <= satEndMs ? now.toISOString() : satEndRange.endAt;
        return {
          startAt: startRange.startAt,
          endAt,
          granularity: "daily",
          displayEndAt: satEndRange.endAt,
        };
      }
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
      const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
      const bizStart = (businessStartTime ?? "00:00").trim();
      if (useBusinessDayBoundaries(businessStartTime)) {
        const startRange = getBusinessDayRangeForDate(tz, bizStart, y, m, 1);
        const endRange = getBusinessDayRangeForDate(tz, bizStart, y, m, d);
        const displayEndRange = getBusinessDayRangeForDate(tz, bizStart, y, m, lastDayOfMonth);
        return {
          startAt: startRange.startAt,
          endAt: endRange.endAt,
          granularity: "daily",
          displayEndAt: displayEndRange.endAt,
        };
      }
      const startDate = getStartOfDayUtc(y, m, 1, tz);
      const endDate = getEndOfDayUtc(y, m, d, tz);
      const displayEndDate = getEndOfDayUtc(y, m, lastDayOfMonth, tz);
      return {
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        granularity: "daily",
        displayEndAt: displayEndDate.toISOString(),
      };
    }
    case "thisYear": {
      const bizStart = (businessStartTime ?? "00:00").trim();
      if (useBusinessDayBoundaries(businessStartTime)) {
        const startRange = getBusinessDayRangeForDate(tz, bizStart, y, 0, 1);
        const endRange = getBusinessDayRangeForDate(tz, bizStart, y, m, d);
        const displayEndRange = getBusinessDayRangeForDate(tz, bizStart, y, 11, 31);
        return {
          startAt: startRange.startAt,
          endAt: endRange.endAt,
          granularity: "monthly",
          displayEndAt: displayEndRange.endAt,
        };
      }
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

const BUSINESS_START_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

function useBusinessDayBoundaries(businessStartTime?: string): boolean {
  const bizStart = (businessStartTime ?? "00:00").trim();
  return BUSINESS_START_REGEX.test(bizStart);
}

/** 1-based week number of the month for the week that starts on the given Sunday (calendar date). */
function getWeekOfMonthForSunday(
  y: number,
  m: number,
  sundayDay: number,
  tz: string,
): number {
  const dow1 = getDayOfWeekInTz(y, m, 1, tz);
  const firstSunday = dow1 === 0 ? 1 : 8 - dow1;
  if (sundayDay < firstSunday) return 1;
  return 1 + Math.floor((sundayDay - firstSunday) / 7);
}

/** Sunday (y, m, d) that starts the given 1-based week in (y, m). Clamps to last valid week if weekNum too high. */
function getSundayOfWeekInMonth(
  y: number,
  m: number,
  weekNum: number,
  tz: string,
): { y: number; m: number; d: number } {
  const dow1 = getDayOfWeekInTz(y, m, 1, tz);
  const firstSunday = dow1 === 0 ? 1 : 8 - dow1;
  const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
  let sundayDay = firstSunday + (weekNum - 1) * 7;
  if (sundayDay > lastDayOfMonth) {
    sundayDay = firstSunday + (Math.floor((lastDayOfMonth - firstSunday) / 7)) * 7;
  }
  return { y, m, d: sundayDay };
}

/** Last Sun–Sat week that touches the month (week containing the last day). */
function getLastWeekOfMonth(
  y: number,
  m: number,
  tz: string,
): { start: { y: number; m: number; d: number }; end: { y: number; m: number; d: number } } {
  const lastDay = new Date(y, m + 1, 0).getDate();
  const dow = getDayOfWeekInTz(y, m, lastDay, tz);
  const startDay = lastDay - dow;
  const start = startDay < 1 ? addDays(y, m, lastDay, -dow) : { y, m, d: startDay };
  const end = { y, m, d: lastDay };
  return { start, end };
}

/**
 * Get the comparison period range given the primary period range and comparison type.
 * Returns same-length range aligned with comparison option; same granularity as primary.
 * For custom, pass customComparisonStart and customComparisonEnd (both ISO or YYYY-MM-DD).
 * Optional businessStartTime ensures custom comparison uses store business day boundaries.
 * When periodType is "thisWeek", samePeriodPreviousWeek / samePeriodPreviousMonth / priorYear use week-of-month semantics.
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
  periodType?: PeriodType,
): ComparisonRangeResult | null {
  if (comparisonType === "none") return null;

  const tz = timezone.trim();
  const start = new Date(periodStartAt);
  const end = new Date(periodEndAt);
  const durationMs = end.getTime() - start.getTime();
  const bizStart = (businessStartTime ?? "00:00").trim();
  const useBiz = useBusinessDayBoundaries(businessStartTime);

  const periodTypesWithWeekLogic: PeriodType[] = [
    "last7days",
    "last30days",
    "last52weeks",
    "thisWeek",
    "thisMonth",
    "thisYear",
    "custom",
  ];
  const comparisonTypesWithWeekLogic: ComparisonType[] = [
    "samePeriodPreviousWeek",
    "samePeriodPreviousMonth",
    "priorYear",
    "52WeeksPrior",
    "year2Before",
    "year3Before",
    "year4Before",
  ];

  if (
    periodType &&
    periodTypesWithWeekLogic.includes(periodType) &&
    comparisonTypesWithWeekLogic.includes(comparisonType)
  ) {
    const startParts = getDatePartsInTz(start, tz);
    const endParts = getDatePartsInTz(end, tz);
    const startDayOfWeek = getDayOfWeekInTz(startParts.y, startParts.m, startParts.d, tz);
    const endDayOfWeek = getDayOfWeekInTz(endParts.y, endParts.m, endParts.d, tz);
    const startSunday = addDays(startParts.y, startParts.m, startParts.d, -startDayOfWeek);
    const endSunday = addDays(endParts.y, endParts.m, endParts.d, -endDayOfWeek);
    const W_start = getWeekOfMonthForSunday(startSunday.y, startSunday.m, startSunday.d, tz);
    const W_end = getWeekOfMonthForSunday(endSunday.y, endSunday.m, endSunday.d, tz);

    let prevStartY: number;
    let prevStartM: number;
    let prevEndY: number;
    let prevEndM: number;
    let targetW_start: number;
    let targetW_end: number;

    if (comparisonType === "samePeriodPreviousWeek") {
      prevStartY = startParts.y;
      prevStartM = startParts.m;
      prevEndY = endParts.y;
      prevEndM = endParts.m;
      targetW_start = W_start;
      targetW_end = W_end;
    } else if (comparisonType === "samePeriodPreviousMonth") {
      prevStartY = startParts.y;
      prevStartM = startParts.m - 1;
      if (prevStartM < 0) {
        prevStartM += 12;
        prevStartY -= 1;
      }
      prevEndY = endParts.y;
      prevEndM = endParts.m - 1;
      if (prevEndM < 0) {
        prevEndM += 12;
        prevEndY -= 1;
      }
      targetW_start = W_start;
      targetW_end = W_end;
    } else {
      const n =
        comparisonType === "priorYear" || comparisonType === "52WeeksPrior"
          ? 1
          : comparisonType === "year2Before"
            ? 2
            : comparisonType === "year3Before"
              ? 3
              : 4;
      prevStartY = startParts.y - n;
      prevStartM = startParts.m;
      prevEndY = endParts.y - n;
      prevEndM = endParts.m;
      targetW_start = W_start;
      targetW_end = W_end;
    }

    const getSunStart = (): { y: number; m: number; d: number } => {
      if (comparisonType === "samePeriodPreviousWeek" && targetW_start <= 1) {
        const py = prevStartM === 0 ? prevStartY - 1 : prevStartY;
        const pm = prevStartM === 0 ? 11 : prevStartM - 1;
        const { start: lastStart } = getLastWeekOfMonth(py, pm, tz);
        return lastStart;
      }
      if (comparisonType === "samePeriodPreviousWeek") {
        return getSundayOfWeekInMonth(prevStartY, prevStartM, targetW_start - 1, tz);
      }
      return getSundayOfWeekInMonth(prevStartY, prevStartM, targetW_start, tz);
    };
    const getSunEnd = (): { y: number; m: number; d: number } => {
      if (comparisonType === "samePeriodPreviousWeek" && targetW_end <= 1) {
        const py = prevEndM === 0 ? prevEndY - 1 : prevEndY;
        const pm = prevEndM === 0 ? 11 : prevEndM - 1;
        const { start: lastStart } = getLastWeekOfMonth(py, pm, tz);
        return lastStart;
      }
      if (comparisonType === "samePeriodPreviousWeek") {
        return getSundayOfWeekInMonth(prevEndY, prevEndM, targetW_end - 1, tz);
      }
      return getSundayOfWeekInMonth(prevEndY, prevEndM, targetW_end, tz);
    };

    const sunStart = getSunStart();
    const sunEnd = getSunEnd();
    const compStart = addDays(sunStart.y, sunStart.m, sunStart.d, startDayOfWeek);
    const compEnd = addDays(sunEnd.y, sunEnd.m, sunEnd.d, endDayOfWeek);

    if (useBiz) {
      const startR = getBusinessDayRangeForDate(tz, bizStart, compStart.y, compStart.m, compStart.d);
      const endR = getBusinessDayRangeForDate(tz, bizStart, compEnd.y, compEnd.m, compEnd.d);
      return { startAt: startR.startAt, endAt: endR.endAt };
    }
    return {
      startAt: getStartOfDayUtc(compStart.y, compStart.m, compStart.d, tz).toISOString(),
      endAt: getEndOfDayUtc(compEnd.y, compEnd.m, compEnd.d, tz).toISOString(),
    };
  }

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

  const rangeFromCalendar = (
    sy: number,
    sm: number,
    sd: number,
    ey: number,
    em: number,
    ed: number,
  ): ComparisonRangeResult => {
    if (useBiz) {
      const startR = getBusinessDayRangeForDate(tz, bizStart, sy, sm, sd);
      const endR = getBusinessDayRangeForDate(tz, bizStart, ey, em, ed);
      return { startAt: startR.startAt, endAt: endR.endAt };
    }
    return {
      startAt: getStartOfDayUtc(sy, sm, sd, tz).toISOString(),
      endAt: getEndOfDayUtc(ey, em, ed, tz).toISOString(),
    };
  };

  switch (comparisonType) {
    case "1DayPrior": {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const startRef = new Date(start.getTime() - oneDayMs);
      const endRef = new Date(end.getTime() - oneDayMs);
      const sp = getDatePartsInTz(startRef, tz);
      const ep = getDatePartsInTz(endRef, tz);
      return rangeFromCalendar(sp.y, sp.m, sp.d, ep.y, ep.m, ep.d);
    }
    case "samePeriodPreviousWeek": {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const startRef = new Date(start.getTime() - oneWeekMs);
      const endRef = new Date(end.getTime() - oneWeekMs);
      const sp = getDatePartsInTz(startRef, tz);
      const ep = getDatePartsInTz(endRef, tz);
      return rangeFromCalendar(sp.y, sp.m, sp.d, ep.y, ep.m, ep.d);
    }
    case "samePeriodPreviousMonth": {
      const startParts = getDatePartsInTz(start, tz);
      const endParts = getDatePartsInTz(end, tz);
      let newSy = startParts.y;
      let newSm = startParts.m - 1;
      if (newSm < 0) {
        newSm += 12;
        newSy -= 1;
      }
      const startMaxDay = new Date(newSy, newSm + 1, 0).getDate();
      const newSd = Math.min(startParts.d, startMaxDay);

      let newEy = endParts.y;
      let newEm = endParts.m - 1;
      if (newEm < 0) {
        newEm += 12;
        newEy -= 1;
      }
      const endMaxDay = new Date(newEy, newEm + 1, 0).getDate();
      const newEd = Math.min(endParts.d, endMaxDay);

      return rangeFromCalendar(newSy, newSm, newSd, newEy, newEm, newEd);
    }
    case "priorYear": {
      const startParts = getDatePartsInTz(start, tz);
      const endParts = getDatePartsInTz(end, tz);
      const targetStartY = startParts.y - 1;
      const targetEndY = endParts.y - 1;
      const endLastDay = new Date(targetEndY, endParts.m + 1, 0).getDate();
      const targetEndD = Math.min(endParts.d, endLastDay);
      return rangeFromCalendar(
        targetStartY,
        startParts.m,
        startParts.d,
        targetEndY,
        endParts.m,
        targetEndD,
      );
    }
    case "52WeeksPrior": {
      const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      let startRef: Date;
      let endRef: Date;
      if (durationDays > 360) {
        startRef = new Date(start);
        startRef.setUTCMonth(startRef.getUTCMonth() - 12);
        endRef = new Date(end);
        endRef.setUTCMonth(endRef.getUTCMonth() - 12);
      } else {
        const fiftyTwoWeeksMs = 52 * 7 * 24 * 60 * 60 * 1000;
        startRef = new Date(start.getTime() - fiftyTwoWeeksMs);
        endRef = new Date(end.getTime() - fiftyTwoWeeksMs);
      }
      const sp = getDatePartsInTz(startRef, tz);
      const ep = getDatePartsInTz(endRef, tz);
      return rangeFromCalendar(sp.y, sp.m, sp.d, ep.y, ep.m, ep.d);
    }
    case "year2Before":
    case "year3Before":
    case "year4Before": {
      const parts = getDatePartsInTz(end, tz);
      const n = comparisonType === "year2Before" ? 2 : comparisonType === "year3Before" ? 3 : 4;
      const targetYear = parts.y - n;
      return rangeFromCalendar(targetYear, 0, 1, targetYear, 11, 31);
    }
    default:
      return null;
  }
}

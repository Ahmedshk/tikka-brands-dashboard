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

/** Optional arguments for getSalesTrendComparisonRange (custom comparison dates and period type). */
export interface GetSalesTrendComparisonRangeOptions {
  customComparisonDate?: string;
  customComparisonStart?: string;
  customComparisonEnd?: string;
  businessStartTime?: string;
  periodType?: PeriodType;
}

import {
  getBusinessStartTimeRange,
  getBusinessDayRangeForDate,
  getStartOfDayUtc,
  getEndOfDayUtc,
  getCalendarYmdInTz,
} from "./timezone.util.js";

export { getStartOfDayUtc, getEndOfDayUtc } from "./timezone.util.js";

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

/**
 * Add days to a civil calendar date (y, month 0-based, d). Uses UTC date math so
 * results do not depend on the Node process timezone (host-local `Date(y,m,d)` was wrong).
 */
function addDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const x = new Date(Date.UTC(y, m, d + delta));
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth(),
    d: x.getUTCDate(),
  };
}

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

  if (periodType === "custom" && customStart != null && customEnd != null) {
    return getCustomPeriodRange(tz, customStart, customEnd, y, m, d, businessStartTime);
  }

  switch (periodType) {
    case "today":
      return getTodayPeriodRange(tz, y, m, d, businessStartTime);
    case "last7days":
      return getLastNDaysPeriodRange(tz, y, m, d, 7, businessStartTime);
    case "last30days":
      return getLastNDaysPeriodRange(tz, y, m, d, 30, businessStartTime);
    case "last52weeks":
      return getLast52WeeksPeriodRange(tz, y, m, d, businessStartTime);
    case "thisWeek":
      return getThisWeekPeriodRange(tz, y, m, d, businessStartTime);
    case "thisMonth":
      return getThisMonthPeriodRange(tz, y, m, d, businessStartTime);
    case "thisYear":
      return getThisYearPeriodRange(tz, y, m, d, businessStartTime);
    default:
      return getSalesTrendPeriodRange("last30days", tz);
  }
}

/** Get (year, month 0-based, day) of a date in the given timezone. Exported for TZ-aware monthly bucket iteration. */
export function getDatePartsInTz(date: Date, timezone: string): { y: number; m: number; d: number } {
  return getCalendarYmdInTz(date.getTime(), timezone);
}

/** Number of calendar days (in the given timezone) covered by the range. Used for KPI numDays so single-day ranges yield 1. */
export function getCalendarDayCountInRange(
  range: { startAt: string; endAt: string },
  timezone: string,
): number {
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  const startParts = getDatePartsInTz(start, timezone);
  const endParts = getDatePartsInTz(end, timezone);
  let count = 0;
  let y = startParts.y;
  let m = startParts.m;
  let d = startParts.d;
  while (
    y < endParts.y ||
    (y === endParts.y && m < endParts.m) ||
    (y === endParts.y && m === endParts.m && d <= endParts.d)
  ) {
    count += 1;
    const next = addDays(y, m, d, 1);
    y = next.y;
    m = next.m;
    d = next.d;
  }
  return count;
}

const BUSINESS_START_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

function useBusinessDayBoundaries(businessStartTime?: string): boolean {
  const bizStart = (businessStartTime ?? "00:00").trim();
  return BUSINESS_START_REGEX.test(bizStart);
}

function getTodayPeriodRange(
  tz: string,
  y: number,
  m: number,
  d: number,
  businessStartTime?: string,
): PeriodRangeResult {
  const bizStart = (businessStartTime ?? "00:00").trim();
  if (useBusinessDayBoundaries(businessStartTime)) {
    const { startAt, endAt } = getBusinessStartTimeRange(tz, bizStart);
    return { startAt, endAt: new Date().toISOString(), granularity: "hourly", displayEndAt: endAt };
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

function getLastNDaysPeriodRange(
  tz: string,
  y: number,
  m: number,
  d: number,
  n: number,
  businessStartTime?: string,
): PeriodRangeResult {
  const end = { y, m, d };
  const start = addDays(end.y, end.m, end.d, -(n - 1));
  const bizStart = (businessStartTime ?? "00:00").trim();
  if (useBusinessDayBoundaries(businessStartTime)) {
    const startRange = getBusinessDayRangeForDate(tz, bizStart, start.y, start.m, start.d);
    const endRange = getBusinessDayRangeForDate(tz, bizStart, end.y, end.m, end.d);
    return { startAt: startRange.startAt, endAt: endRange.endAt, granularity: "daily" };
  }
  const startDate = getStartOfDayUtc(start.y, start.m, start.d, tz);
  const endDate = getEndOfDayUtc(end.y, end.m, end.d, tz);
  return { startAt: startDate.toISOString(), endAt: endDate.toISOString(), granularity: "daily" };
}

function getLast52WeeksPeriodRange(
  tz: string,
  y: number,
  m: number,
  _d: number,
  businessStartTime?: string,
): PeriodRangeResult {
  const startMonth = new Date(y, m - 12, 1);
  const startY = startMonth.getFullYear();
  const startM = startMonth.getMonth();
  const lastDayOfCurrentMonth = new Date(y, m + 1, 0).getDate();
  const bizStart = (businessStartTime ?? "00:00").trim();
  if (useBusinessDayBoundaries(businessStartTime)) {
    const startRange = getBusinessDayRangeForDate(tz, bizStart, startY, startM, 1);
    const endRange = getBusinessDayRangeForDate(tz, bizStart, y, m, lastDayOfCurrentMonth);
    return { startAt: startRange.startAt, endAt: endRange.endAt, granularity: "monthly" };
  }
  const startDate = getStartOfDayUtc(startY, startM, 1, tz);
  const endDate = getEndOfDayUtc(y, m, lastDayOfCurrentMonth, tz);
  return { startAt: startDate.toISOString(), endAt: endDate.toISOString(), granularity: "monthly" };
}

function getThisWeekPeriodRange(
  tz: string,
  y: number,
  m: number,
  d: number,
  businessStartTime?: string,
): PeriodRangeResult {
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
    return { startAt: startRange.startAt, endAt, granularity: "daily", displayEndAt: satEndRange.endAt };
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

function getThisMonthPeriodRange(
  tz: string,
  y: number,
  m: number,
  d: number,
  businessStartTime?: string,
): PeriodRangeResult {
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

function getThisYearPeriodRange(
  tz: string,
  y: number,
  m: number,
  d: number,
  businessStartTime?: string,
): PeriodRangeResult {
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

interface CustomRangeBoundsParams {
  tz: string;
  bizStart: string;
  start: { y: number; m: number; d: number };
  end: { y: number; m: number; d: number };
  endDayIsToday: boolean;
  endOfToday: Date;
}

function getCustomRangeBounds(
  params: CustomRangeBoundsParams,
): { startAt: string; endAt: string; displayEndAtIso: string } {
  const { tz, bizStart, start: sy, end: ey, endDayIsToday, endOfToday } = params;
  const { y: sy_, m: sm, d: sd } = sy;
  const { y: ey_, m: em, d: ed } = ey;
  if (BUSINESS_START_REGEX.test(bizStart)) {
    const startRange = getBusinessDayRangeForDate(tz, bizStart, sy_, sm, sd);
    const endRange = getBusinessDayRangeForDate(tz, bizStart, ey_, em, ed);
    const endAt = endDayIsToday ? new Date().toISOString() : endRange.endAt;
    return { startAt: startRange.startAt, endAt, displayEndAtIso: endRange.endAt };
  }
  const startAt = getStartOfDayUtc(sy_, sm, sd, tz).toISOString();
  const endOfEndDay = getEndOfDayUtc(ey_, em, ed, tz);
  const displayEndAtIso = endOfEndDay.toISOString();
  let endAt: string;
  if (!endDayIsToday) {
    endAt = endOfEndDay.toISOString();
  } else if (Date.now() <= endOfToday.getTime()) {
    endAt = new Date().toISOString();
  } else {
    endAt = endOfToday.toISOString();
  }
  return { startAt, endAt, displayEndAtIso };
}

function getCustomPeriodRange(
  tz: string,
  customStart: string,
  customEnd: string,
  y: number,
  m: number,
  d: number,
  businessStartTime?: string,
): PeriodRangeResult {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customStart.trim());
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customEnd.trim());
  if (!startMatch || !endMatch) {
    return getLastNDaysPeriodRange(tz, y, m, d, 30, businessStartTime);
  }
  const sy = Number.parseInt(startMatch[1]!, 10);
  const sm = Number.parseInt(startMatch[2]!, 10) - 1;
  const sd = Number.parseInt(startMatch[3]!, 10);
  const ey = Number.parseInt(endMatch[1]!, 10);
  const em = Number.parseInt(endMatch[2]!, 10) - 1;
  const ed = Number.parseInt(endMatch[3]!, 10);
  const bizStart = (businessStartTime ?? "00:00").trim();
  const endDayIsToday = ey === y && em === m && ed === d;
  const endOfToday = getEndOfDayUtc(y, m, d, tz);
  const { startAt, endAt, displayEndAtIso } = getCustomRangeBounds({
    tz,
    bizStart,
    start: { y: sy, m: sm, d: sd },
    end: { y: ey, m: em, d: ed },
    endDayIsToday,
    endOfToday,
  });

  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const isSingleDay = sy === ey && sm === em && sd === ed;
  const days = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  let granularity: Granularity = "daily";
  if (isSingleDay || days <= 1) granularity = "hourly";
  else if (days > 90) granularity = "weekly";
  const withDisplayEnd =
    endDayIsToday ? { displayEndAt: displayEndAtIso } : {};
  return { startAt, endAt, granularity, ...withDisplayEnd };
}

/** Whole days between two civil dates in `timezone` (non-negative when `early` is on or before `late`). */
function calendarDayDiff(
  early: { y: number; m: number; d: number },
  late: { y: number; m: number; d: number },
  timezone: string,
): number {
  const t0 = getStartOfDayUtc(early.y, early.m, early.d, timezone).getTime();
  const t1 = getStartOfDayUtc(late.y, late.m, late.d, timezone).getTime();
  return Math.round((t1 - t0) / (24 * 60 * 60 * 1000));
}

/**
 * 1-based week index within the calendar month (y, m): week 1 is the Sun–Sat week that contains the 1st.
 * Used for rolling last7/last30/custom so e.g. Thu Apr 2 is week 1 of April (not week 5 of March via the Mar 29 Sunday).
 */
function getWeekOfMonthFromFirstOfMonth(y: number, m: number, d: number, tz: string): number {
  const dow1 = getDayOfWeekInTz(y, m, 1, tz);
  const sunWeekOf1st = addDays(y, m, 1, -dow1);
  const dowD = getDayOfWeekInTz(y, m, d, tz);
  const sunWeekOfD = addDays(y, m, d, -dowD);
  const diff = Math.max(0, calendarDayDiff(sunWeekOf1st, sunWeekOfD, tz));
  return 1 + Math.floor(diff / 7);
}

/**
 * Sunday that starts the `weekNum`-th week (1-based) of calendar month (y, m): same rule as
 * getWeekOfMonthFromFirstOfMonth (week 1 contains the 1st). Use with anchor-based W for rolling/thisWeek;
 * legacy getSundayOfWeekInMonth uses “first Sunday on/after the 1st” and disagrees for e.g. April week 2.
 */
function getSundayOfNthAnchorWeekInMonth(
  y: number,
  m: number,
  weekNum: number,
  tz: string,
): { y: number; m: number; d: number } {
  const n = Math.max(1, weekNum);
  const dow1 = getDayOfWeekInTz(y, m, 1, tz);
  const sunWeekContainingFirst = addDays(y, m, 1, -dow1);
  return addDays(
    sunWeekContainingFirst.y,
    sunWeekContainingFirst.m,
    sunWeekContainingFirst.d,
    (n - 1) * 7,
  );
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

/** Calendar-bounded periods that may use week-of-month comparison (thisMonth/thisYear keep legacy week index). */
const CALENDAR_BOUNDED_PERIOD_TYPES_FOR_WEEK_COMPARISON = new Set<PeriodType>([
  "thisWeek",
  "thisMonth",
  "thisYear",
]);
const COMPARISON_TYPES_WITH_WEEK_LOGIC = new Set<ComparisonType>([
  "samePeriodPreviousWeek",
  "samePeriodPreviousMonth",
  "priorYear",
  "52WeeksPrior",
  "year2Before",
  "year3Before",
  "year4Before",
]);

/**
 * Periods where week-of-month is the Sun–Sat week that contains the month’s 1st (not “first Sunday on/after the 1st”).
 * Sunday lookup for comparison uses the same anchor (see getSundayOfNthAnchorWeekInMonth). Rolling/custom ends use
 * the primary span; **thisWeek** uses a full Sun–Sat comparison window (handled in getComparisonRangeWithWeekLogic).
 */
const PERIOD_TYPES_MONTH_ANCHOR_WEEK_AND_SPAN_END = new Set<PeriodType>([
  "thisWeek",
  "last7days",
  "last30days",
  "custom",
]);

/** Full previous calendar month in TZ (for thisMonth + samePeriodPreviousMonth). */
function getFullPreviousCalendarMonthComparison(
  periodEndAt: string,
  tz: string,
  bizStart: string,
  useBiz: boolean,
): ComparisonRangeResult {
  const endParts = getDatePartsInTz(new Date(periodEndAt), tz);
  let pm = endParts.m - 1;
  let py = endParts.y;
  if (pm < 0) {
    pm += 12;
    py -= 1;
  }
  const startCal = { y: py, m: pm, d: 1 };
  const lastD = new Date(py, pm + 1, 0).getDate();
  const endCal = { y: py, m: pm, d: lastD };
  return rangeFromCalendar(tz, bizStart, useBiz, startCal, endCal);
}

/** Full same calendar month in year − 1 (for thisMonth + priorYear). */
function getFullSameMonthPriorYearComparison(
  periodStartAt: string,
  tz: string,
  bizStart: string,
  useBiz: boolean,
): ComparisonRangeResult {
  const sp = getDatePartsInTz(new Date(periodStartAt), tz);
  const y = sp.y - 1;
  const m = sp.m;
  const lastD = new Date(y, m + 1, 0).getDate();
  return rangeFromCalendar(tz, bizStart, useBiz, { y, m, d: 1 }, { y, m, d: lastD });
}

/** Full prior calendar year Jan 1 – Dec 31 (for thisYear + priorYear). */
function getFullPriorCalendarYearComparison(
  periodStartAt: string,
  tz: string,
  bizStart: string,
  useBiz: boolean,
): ComparisonRangeResult {
  const sp = getDatePartsInTz(new Date(periodStartAt), tz);
  const y = sp.y - 1;
  return rangeFromCalendar(tz, bizStart, useBiz, { y, m: 0, d: 1 }, { y, m: 11, d: 31 });
}

function getComparisonRangeWithWeekLogic(
  comparisonType: ComparisonType,
  start: Date,
  end: Date,
  tz: string,
  bizStart: string,
  useBiz: boolean,
  periodType?: PeriodType,
): ComparisonRangeResult {
  const startParts = getDatePartsInTz(start, tz);
  const endParts = getDatePartsInTz(end, tz);
  const startDayOfWeek = getDayOfWeekInTz(startParts.y, startParts.m, startParts.d, tz);
  const endDayOfWeek = getDayOfWeekInTz(endParts.y, endParts.m, endParts.d, tz);
  const useMonthAnchorWeekAndSpanEnd =
    periodType != null && PERIOD_TYPES_MONTH_ANCHOR_WEEK_AND_SPAN_END.has(periodType);
  let W_start: number;
  let W_end: number;
  if (useMonthAnchorWeekAndSpanEnd) {
    W_start = getWeekOfMonthFromFirstOfMonth(startParts.y, startParts.m, startParts.d, tz);
    W_end = getWeekOfMonthFromFirstOfMonth(endParts.y, endParts.m, endParts.d, tz);
  } else {
    const startSunday = addDays(startParts.y, startParts.m, startParts.d, -startDayOfWeek);
    const endSunday = addDays(endParts.y, endParts.m, endParts.d, -endDayOfWeek);
    W_start = getWeekOfMonthForSunday(startSunday.y, startSunday.m, startSunday.d, tz);
    W_end = getWeekOfMonthForSunday(endSunday.y, endSunday.m, endSunday.d, tz);
  }

  const { prevStartY, prevStartM, prevEndY, prevEndM, targetW_start, targetW_end } =
    computeWeekLogicTargets(comparisonType, startParts, endParts, W_start, W_end);

  const useAnchorWeek = useMonthAnchorWeekAndSpanEnd;
  const sunStart = getSunStartForWeekLogic(
    comparisonType,
    prevStartY,
    prevStartM,
    targetW_start,
    tz,
    useAnchorWeek,
  );
  /** thisWeek: always compare against the full Sun–Sat week in the aligned prior week / month / year (chart may still clip the current period to “today”). */
  let compStart: { y: number; m: number; d: number };
  let compEnd: { y: number; m: number; d: number };
  if (periodType === "thisWeek") {
    compStart = { y: sunStart.y, m: sunStart.m, d: sunStart.d };
    compEnd = addDays(sunStart.y, sunStart.m, sunStart.d, 6);
  } else {
    compStart = addDays(sunStart.y, sunStart.m, sunStart.d, startDayOfWeek);
    /** Month-anchor rolling/custom: span matches primary; mapping end by week alone can clamp (e.g. Feb has no “week 5”). */
    if (useMonthAnchorWeekAndSpanEnd) {
      const spanDays = calendarDayDiff(startParts, endParts, tz);
      compEnd = addDays(compStart.y, compStart.m, compStart.d, spanDays);
    } else {
      const sunEnd = getSunEndForWeekLogic(
        comparisonType,
        prevEndY,
        prevEndM,
        targetW_end,
        tz,
        useAnchorWeek,
      );
      compEnd = addDays(sunEnd.y, sunEnd.m, sunEnd.d, endDayOfWeek);
    }
  }

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

function computeWeekLogicTargets(
  comparisonType: ComparisonType,
  startParts: { y: number; m: number; d: number },
  endParts: { y: number; m: number; d: number },
  W_start: number,
  W_end: number,
): {
  prevStartY: number;
  prevStartM: number;
  prevEndY: number;
  prevEndM: number;
  targetW_start: number;
  targetW_end: number;
} {
  if (comparisonType === "samePeriodPreviousWeek") {
    return {
      prevStartY: startParts.y,
      prevStartM: startParts.m,
      prevEndY: endParts.y,
      prevEndM: endParts.m,
      targetW_start: W_start,
      targetW_end: W_end,
    };
  }
  if (comparisonType === "samePeriodPreviousMonth") {
    let prevStartM = startParts.m - 1;
    let prevStartY = startParts.y;
    if (prevStartM < 0) {
      prevStartM += 12;
      prevStartY -= 1;
    }
    let prevEndM = endParts.m - 1;
    let prevEndY = endParts.y;
    if (prevEndM < 0) {
      prevEndM += 12;
      prevEndY -= 1;
    }
    return {
      prevStartY,
      prevStartM,
      prevEndY,
      prevEndM,
      targetW_start: W_start,
      targetW_end: W_end,
    };
  }
  let n: number;
  if (comparisonType === "priorYear" || comparisonType === "52WeeksPrior") n = 1;
  else if (comparisonType === "year2Before") n = 2;
  else if (comparisonType === "year3Before") n = 3;
  else n = 4;
  return {
    prevStartY: startParts.y - n,
    prevStartM: startParts.m,
    prevEndY: endParts.y - n,
    prevEndM: endParts.m,
    targetW_start: W_start,
    targetW_end: W_end,
  };
}

function weekSundayInMonth(
  y: number,
  m: number,
  weekNum: number,
  tz: string,
  useAnchorWeek: boolean,
): { y: number; m: number; d: number } {
  return useAnchorWeek
    ? getSundayOfNthAnchorWeekInMonth(y, m, weekNum, tz)
    : getSundayOfWeekInMonth(y, m, weekNum, tz);
}

function getSunStartForWeekLogic(
  comparisonType: ComparisonType,
  prevStartY: number,
  prevStartM: number,
  targetW_start: number,
  tz: string,
  useAnchorWeek: boolean,
): { y: number; m: number; d: number } {
  if (comparisonType === "samePeriodPreviousWeek" && targetW_start <= 1) {
    const py = prevStartM === 0 ? prevStartY - 1 : prevStartY;
    const pm = prevStartM === 0 ? 11 : prevStartM - 1;
    const { start: lastStart } = getLastWeekOfMonth(py, pm, tz);
    return lastStart;
  }
  if (comparisonType === "samePeriodPreviousWeek") {
    return weekSundayInMonth(
      prevStartY,
      prevStartM,
      targetW_start - 1,
      tz,
      useAnchorWeek,
    );
  }
  return weekSundayInMonth(prevStartY, prevStartM, targetW_start, tz, useAnchorWeek);
}

function getSunEndForWeekLogic(
  comparisonType: ComparisonType,
  prevEndY: number,
  prevEndM: number,
  targetW_end: number,
  tz: string,
  useAnchorWeek: boolean,
): { y: number; m: number; d: number } {
  if (comparisonType === "samePeriodPreviousWeek" && targetW_end <= 1) {
    const py = prevEndM === 0 ? prevEndY - 1 : prevEndY;
    const pm = prevEndM === 0 ? 11 : prevEndM - 1;
    const { start: lastStart } = getLastWeekOfMonth(py, pm, tz);
    return lastStart;
  }
  if (comparisonType === "samePeriodPreviousWeek") {
    return weekSundayInMonth(prevEndY, prevEndM, targetW_end - 1, tz, useAnchorWeek);
  }
  return weekSundayInMonth(prevEndY, prevEndM, targetW_end, tz, useAnchorWeek);
}

function getCustomComparisonRange(
  customComparisonStart: string | undefined,
  customComparisonEnd: string | undefined,
  customComparisonDate: string | undefined,
  tz: string,
  bizStart: string,
  durationMs: number,
): ComparisonRangeResult | null {
  if (customComparisonStart != null && customComparisonEnd != null) {
    return getCustomComparisonRangeByStartEnd(
      customComparisonStart,
      customComparisonEnd,
      tz,
      bizStart,
    );
  }
  if (customComparisonDate != null) {
    return getCustomComparisonRangeByDate(
      customComparisonDate,
      tz,
      bizStart,
      durationMs,
    );
  }
  return null;
}

function getCustomComparisonRangeByStartEnd(
  customStart: string,
  customEnd: string,
  tz: string,
  bizStart: string,
): ComparisonRangeResult | null {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customStart.trim());
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(customEnd.trim());
  if (!startMatch || !endMatch) return null;
  const sy = Number.parseInt(startMatch[1]!, 10);
  const sm = Number.parseInt(startMatch[2]!, 10) - 1;
  const sd = Number.parseInt(startMatch[3]!, 10);
  const ey = Number.parseInt(endMatch[1]!, 10);
  const em = Number.parseInt(endMatch[2]!, 10) - 1;
  const ed = Number.parseInt(endMatch[3]!, 10);
  if (BUSINESS_START_REGEX.test(bizStart)) {
    const startRange = getBusinessDayRangeForDate(tz, bizStart, sy, sm, sd);
    const endRange = getBusinessDayRangeForDate(tz, bizStart, ey, em, ed);
    return { startAt: startRange.startAt, endAt: endRange.endAt };
  }
  return {
    startAt: getStartOfDayUtc(sy, sm, sd, tz).toISOString(),
    endAt: getEndOfDayUtc(ey, em, ed, tz).toISOString(),
  };
}

function getCustomComparisonRangeByDate(
  customComparisonDate: string,
  tz: string,
  bizStart: string,
  durationMs: number,
): ComparisonRangeResult | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(customComparisonDate.trim());
  if (!match) return null;
  const refY = Number.parseInt(match[1]!, 10);
  const refM = Number.parseInt(match[2]!, 10) - 1;
  const refD = Number.parseInt(match[3]!, 10);
  const useBusinessDay = BUSINESS_START_REGEX.test(bizStart);
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

function rangeFromCalendar(
  tz: string,
  bizStart: string,
  useBiz: boolean,
  start: { y: number; m: number; d: number },
  end: { y: number; m: number; d: number },
): ComparisonRangeResult {
  if (useBiz) {
    const startR = getBusinessDayRangeForDate(tz, bizStart, start.y, start.m, start.d);
    const endR = getBusinessDayRangeForDate(tz, bizStart, end.y, end.m, end.d);
    return { startAt: startR.startAt, endAt: endR.endAt };
  }
  return {
    startAt: getStartOfDayUtc(start.y, start.m, start.d, tz).toISOString(),
    endAt: getEndOfDayUtc(end.y, end.m, end.d, tz).toISOString(),
  };
}

function getComparisonRangeFromSwitch(
  comparisonType: ComparisonType,
  start: Date,
  end: Date,
  tz: string,
  bizStart: string,
  useBiz: boolean,
  periodType?: PeriodType,
): ComparisonRangeResult | null {
  if (periodType === "thisWeek" && COMPARISON_TYPES_WITH_WEEK_LOGIC.has(comparisonType)) {
    return getComparisonRangeWithWeekLogic(
      comparisonType,
      start,
      end,
      tz,
      bizStart,
      useBiz,
      periodType,
    );
  }
  const fromCalendar = (
    startParts: { y: number; m: number; d: number },
    endParts: { y: number; m: number; d: number },
  ) => rangeFromCalendar(tz, bizStart, useBiz, startParts, endParts);

  switch (comparisonType) {
    case "1DayPrior": {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const startRef = new Date(start.getTime() - oneDayMs);
      const endRef = new Date(end.getTime() - oneDayMs);
      return fromCalendar(getDatePartsInTz(startRef, tz), getDatePartsInTz(endRef, tz));
    }
    case "samePeriodPreviousWeek": {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const startRef = new Date(start.getTime() - oneWeekMs);
      const endRef = new Date(end.getTime() - oneWeekMs);
      return fromCalendar(getDatePartsInTz(startRef, tz), getDatePartsInTz(endRef, tz));
    }
    case "samePeriodPreviousMonth": {
      const startParts = getDatePartsInTz(start, tz);
      const endParts = getDatePartsInTz(end, tz);
      const startDate = prevMonthDate(startParts.y, startParts.m, startParts.d);
      const endDate = prevMonthDate(endParts.y, endParts.m, endParts.d);
      return fromCalendar(startDate, endDate);
    }
    case "priorYear": {
      const startParts = getDatePartsInTz(start, tz);
      const endParts = getDatePartsInTz(end, tz);
      const targetStartY = startParts.y - 1;
      const targetEndY = endParts.y - 1;
      const endLastDay = new Date(targetEndY, endParts.m + 1, 0).getDate();
      const targetEndD = Math.min(endParts.d, endLastDay);
      return fromCalendar(
        { y: targetStartY, m: startParts.m, d: startParts.d },
        { y: targetEndY, m: endParts.m, d: targetEndD },
      );
    }
    case "52WeeksPrior": {
      const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      const fiftyTwoWeeksMs = 52 * 7 * 24 * 60 * 60 * 1000;
      let startRef: Date;
      let endRef: Date;
      if (durationDays > 360) {
        startRef = new Date(start);
        startRef.setUTCMonth(startRef.getUTCMonth() - 12);
        endRef = new Date(end);
        endRef.setUTCMonth(endRef.getUTCMonth() - 12);
      } else {
        startRef = new Date(start.getTime() - fiftyTwoWeeksMs);
        endRef = new Date(end.getTime() - fiftyTwoWeeksMs);
      }
      return fromCalendar(getDatePartsInTz(startRef, tz), getDatePartsInTz(endRef, tz));
    }
    case "year2Before":
    case "year3Before":
    case "year4Before": {
      const parts = getDatePartsInTz(end, tz);
      let n: number;
      if (comparisonType === "year2Before") n = 2;
      else if (comparisonType === "year3Before") n = 3;
      else n = 4;
      const targetYear = parts.y - n;
      return fromCalendar(
        { y: targetYear, m: 0, d: 1 },
        { y: targetYear, m: 11, d: 31 },
      );
    }
    default:
      return null;
  }
}

function prevMonthDate(
  y: number,
  m: number,
  d: number,
): { y: number; m: number; d: number } {
  let newM = m - 1;
  let newY = y;
  if (newM < 0) {
    newM += 12;
    newY -= 1;
  }
  const maxDay = new Date(newY, newM + 1, 0).getDate();
  return { y: newY, m: newM, d: Math.min(d, maxDay) };
}

/**
 * Get the comparison period range given the primary period range and comparison type.
 * Returns same-length range aligned with comparison option; same granularity as primary.
 * For custom, pass customComparisonStart and customComparisonEnd in options (both ISO or YYYY-MM-DD).
 * Optional businessStartTime in options ensures custom comparison uses store business day boundaries.
 * Week-of-month + DOW alignment (Sunday-based weeks) applies to thisWeek/thisMonth/thisYear and
 * last7days/last30days/custom for supported comparisons. Rolling/custom use the week containing the month’s 1st
 * and a comparison end aligned to the primary span. **thisWeek** uses the aligned Sun–Sat week in the comparison
 * month/year (full 7 days), independent of how many days have elapsed in the current week.
 * Special cases: thisMonth + samePeriodPreviousMonth → full previous calendar month; thisMonth + priorYear →
 * full same month prior year; thisYear + priorYear → full prior calendar year.
 */
export function getSalesTrendComparisonRange(
  comparisonType: ComparisonType,
  periodStartAt: string,
  periodEndAt: string,
  timezone: string,
  options: GetSalesTrendComparisonRangeOptions = {},
): ComparisonRangeResult | null {
  if (comparisonType === "none") return null;

  const {
    customComparisonDate,
    customComparisonStart,
    customComparisonEnd,
    businessStartTime,
    periodType,
  } = options;

  const tz = timezone.trim();
  const start = new Date(periodStartAt);
  const end = new Date(periodEndAt);
  const durationMs = end.getTime() - start.getTime();
  const bizStart = (businessStartTime ?? "00:00").trim();
  const useBiz = useBusinessDayBoundaries(businessStartTime);

  if (periodType === "thisMonth" && comparisonType === "samePeriodPreviousMonth") {
    return getFullPreviousCalendarMonthComparison(periodEndAt, tz, bizStart, useBiz);
  }
  if (periodType === "thisMonth" && comparisonType === "priorYear") {
    return getFullSameMonthPriorYearComparison(periodStartAt, tz, bizStart, useBiz);
  }
  if (periodType === "thisYear" && comparisonType === "priorYear") {
    return getFullPriorCalendarYearComparison(periodStartAt, tz, bizStart, useBiz);
  }

  const sameWeekUsesWeekOfMonth =
    comparisonType === "samePeriodPreviousWeek" && periodType === "thisWeek";
  const useWeekLogic =
    periodType != null &&
    COMPARISON_TYPES_WITH_WEEK_LOGIC.has(comparisonType) &&
    (comparisonType !== "samePeriodPreviousWeek" || sameWeekUsesWeekOfMonth) &&
    (CALENDAR_BOUNDED_PERIOD_TYPES_FOR_WEEK_COMPARISON.has(periodType) ||
      PERIOD_TYPES_MONTH_ANCHOR_WEEK_AND_SPAN_END.has(periodType));

  if (useWeekLogic) {
    return getComparisonRangeWithWeekLogic(
      comparisonType,
      start,
      end,
      tz,
      bizStart,
      useBiz,
      periodType,
    );
  }

  if (comparisonType === "custom") {
    return getCustomComparisonRange(
      customComparisonStart,
      customComparisonEnd,
      customComparisonDate,
      tz,
      bizStart,
      durationMs,
    );
  }

  return getComparisonRangeFromSwitch(
    comparisonType,
    start,
    end,
    tz,
    bizStart,
    useBiz,
    periodType,
  );
}

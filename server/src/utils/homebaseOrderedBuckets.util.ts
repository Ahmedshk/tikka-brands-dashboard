/**
 * Ordered bucket keys and labels for Homebase/Square-aligned time-series.
 * Extracted from homebase.service to keep cognitive complexity low.
 */
import type { TimeRange } from "./businessHours.util.js";
import {
  getStartOfDayUtc,
  getDatePartsInTz,
} from "./salesTrendDateRange.util.js";

/** Lexicographically later civil date (for aligning daily buckets when UTC vs local disagree). */
function laterCalendarYmd(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number },
): { y: number; m: number; d: number } {
  if (a.y !== b.y) return a.y > b.y ? a : b;
  if (a.m !== b.m) return a.m > b.m ? a : b;
  return a.d >= b.d ? a : b;
}

function utcCalendarYmd(d: Date): { y: number; m: number; d: number } {
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
  };
}

export type SalesTrendGranularity = "hourly" | "daily" | "weekly" | "monthly";

export interface GetOrderedBucketsAndLabelsOptions {
  periodType?: string | undefined;
}

/** Get bucket key for a date in TZ (same format as Square for alignment). */
export function getBucketKeyForDate(
  date: Date,
  timezone: string,
  granularity: SalesTrendGranularity,
): string {
  if (Number.isNaN(date.getTime())) return "";
  const tz = timezone.trim();
  if (granularity === "hourly") {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const parts = f.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour").padStart(2, "0")}`;
  }
  if (granularity === "daily") {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = f.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  if (granularity === "weekly") {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = f.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    const y = Number.parseInt(get("year"), 10);
    const m = Number.parseInt(get("month"), 10) - 1;
    const d = Number.parseInt(get("day"), 10);
    const dt = new Date(y, m, d);
    const dayOfWeek = dt.getDay();
    const toMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mon = new Date(dt);
    mon.setDate(mon.getDate() - toMonday);
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
  }
  if (granularity === "monthly") {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
    });
    const parts = f.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    return `${get("year")}-${get("month")}`;
  }
  return "";
}

function buildHourlyBuckets(
  range: TimeRange,
  tz: string,
): { keys: string[]; labels: string[] } {
  const keys: string[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  const labelF = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: true,
  });
  const hourPartsF = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const getHourParts = (date: Date) => {
    const parts = hourPartsF.formatToParts(date);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "0";
    return {
      y: Number.parseInt(get("year"), 10),
      m: Number.parseInt(get("month"), 10) - 1,
      d: Number.parseInt(get("day"), 10),
      h: Number.parseInt(get("hour"), 10),
    };
  };
  let cursor = (() => {
    const { y, m, d, h } = getHourParts(start);
    const dayStart = getStartOfDayUtc(y, m, d, tz);
    return new Date(dayStart.getTime() + h * 60 * 60 * 1000);
  })();
  while (cursor <= end) {
    const key = getBucketKeyForDate(cursor, tz, "hourly");
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
      labels.push(labelF.format(cursor));
    }
    const next = new Date(cursor.getTime() + 60 * 60 * 1000);
    const { y, m, d, h } = getHourParts(next);
    const dayStart = getStartOfDayUtc(y, m, d, tz);
    cursor = new Date(dayStart.getTime() + h * 60 * 60 * 1000);
  }
  return { keys, labels };
}

function buildDailyBuckets(
  range: TimeRange,
  tz: string,
  periodType: string | undefined,
): { keys: string[]; labels: string[] } {
  const keys: string[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  const showDayName =
    periodType != null &&
    periodType !== "today" &&
    periodType !== "last52weeks" &&
    periodType !== "thisYear";
  const labelF = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  });
  const labelFWithWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  // Legacy startAt used noon-offset "midnight" (e.g. 06:00Z on spring-forward days), which is
  // still the *previous* local calendar day. Period intent matches the later of UTC vs local
  // civil date (Tokyo midnight → UTC prior day also prefers the local start day).
  const startParts = laterCalendarYmd(getDatePartsInTz(start, tz), utcCalendarYmd(start));
  const endParts = getDatePartsInTz(end, tz);
  let y = startParts.y;
  let m = startParts.m;
  let d = startParts.d;
  while (
    y < endParts.y ||
    (y === endParts.y && m < endParts.m) ||
    (y === endParts.y && m === endParts.m && d <= endParts.d)
  ) {
    const cursor = getStartOfDayUtc(y, m, d, tz);
    const key = getBucketKeyForDate(cursor, tz, "daily");
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
      labels.push(
        showDayName ? labelFWithWeekday.format(cursor) : labelF.format(cursor),
      );
    }
    const nextInstant = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const nextParts = getDatePartsInTz(nextInstant, tz);
    y = nextParts.y;
    m = nextParts.m;
    d = nextParts.d;
  }
  return { keys, labels };
}

function buildWeeklyBuckets(
  range: TimeRange,
  tz: string,
): { keys: string[]; labels: string[] } {
  const keys: string[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  const startParts = getDatePartsInTz(start, tz);
  const endParts = getDatePartsInTz(end, tz);
  let y = startParts.y;
  let m = startParts.m;
  let d = startParts.d;
  let weekNum = 1;
  while (
    y < endParts.y ||
    (y === endParts.y && m < endParts.m) ||
    (y === endParts.y && m === endParts.m && d <= endParts.d)
  ) {
    const cursor = getStartOfDayUtc(y, m, d, tz);
    const key = getBucketKeyForDate(cursor, tz, "weekly");
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
      labels.push(`Week ${weekNum}`);
      weekNum += 1;
    }
    const nextInstant = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextParts = getDatePartsInTz(nextInstant, tz);
    y = nextParts.y;
    m = nextParts.m;
    d = nextParts.d;
  }
  return { keys, labels };
}

function buildMonthlyBuckets(
  range: TimeRange,
  tz: string,
  periodType: string | undefined,
): { keys: string[]; labels: string[] } {
  const keys: string[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  const last52weeksAllYear = periodType === "last52weeks";
  const labelF = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
  });
  const labelFWithYear = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    year: "numeric",
  });
  const labelFShortYear = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    year: "2-digit",
  });
  const startParts = getDatePartsInTz(start, tz);
  const endParts = getDatePartsInTz(end, tz);
  const startYear = startParts.y;
  let y = startParts.y;
  let month0 = startParts.m;
  while (y < endParts.y || (y === endParts.y && month0 <= endParts.m)) {
    const cursor = getStartOfDayUtc(y, month0, 1, tz);
    const key = getBucketKeyForDate(cursor, tz, "monthly");
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
      let label: string;
      if (last52weeksAllYear) {
        label = labelFShortYear.format(cursor);
        label = label.replace(/\s*(\d{2})$/, ", $1");
      } else {
        label =
          y === startYear ? labelF.format(cursor) : labelFWithYear.format(cursor);
      }
      labels.push(label);
    }
    month0 += 1;
    if (month0 > 11) {
      month0 = 0;
      y += 1;
    }
  }
  return { keys, labels };
}

/** Generate ordered bucket keys and labels for a range (same as Square for alignment). */
export function getOrderedBucketsAndLabels(
  range: TimeRange,
  timezone: string,
  granularity: SalesTrendGranularity,
  options?: GetOrderedBucketsAndLabelsOptions,
): { keys: string[]; labels: string[] } {
  const tz = timezone.trim();
  const periodType = options?.periodType;

  if (granularity === "hourly") return buildHourlyBuckets(range, tz);
  if (granularity === "daily") return buildDailyBuckets(range, tz, periodType);
  if (granularity === "weekly") return buildWeeklyBuckets(range, tz);
  if (granularity === "monthly") return buildMonthlyBuckets(range, tz, periodType);

  return { keys: [], labels: [] };
}

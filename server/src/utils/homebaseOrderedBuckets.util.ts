/**
 * Ordered bucket keys and labels for Homebase/Square-aligned time-series.
 * Extracted from homebase.service to keep cognitive complexity low.
 */
import type { TimeRange } from "./businessHours.util.js";
import {
  getStartOfDayUtc,
  getDatePartsInTz,
} from "./salesTrendDateRange.util.js";
import {
  businessDateKeysIntersectingUtcRange,
  businessDateKeyForInstant,
  parseYmdBusinessDateKey,
} from "./businessDayUtcRange.util.js";
import {
  incrementLocalWallHour,
  parseYmdHourFromChartKey,
  wallClockZonedHourStartFromYmdHour,
} from "./wallClockHourStart.util.js";
import {
  sundayWeekStartYmdForBusinessDateKey,
} from "./rollupPeriodKeys.util.js";

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
  /** When set, daily/weekly/monthly keys follow business-day semantics (opening calendar date in TZ). */
  businessStartTime?: string | undefined;
}

export interface GetBucketKeyForDateOptions {
  businessStartTime?: string | undefined;
}

/** Get bucket key for a date in TZ (same format as Square for alignment). */
export function getBucketKeyForDate(
  date: Date,
  timezone: string,
  granularity: SalesTrendGranularity,
  bucketOpts?: GetBucketKeyForDateOptions,
): string {
  if (Number.isNaN(date.getTime())) return "";
  const tz = timezone.trim();
  const bstRaw = bucketOpts?.businessStartTime;
  const bst =
    bstRaw != null && String(bstRaw).trim() !== ""
      ? String(bstRaw).trim()
      : undefined;
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
    if (bst != null) {
      return businessDateKeyForInstant(date, tz, bst);
    }
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
    if (bst != null) {
      const bd = businessDateKeyForInstant(date, tz, bst);
      return sundayWeekStartYmdForBusinessDateKey(bd, tz);
    }
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
    const toSunday = dayOfWeek;
    const sun = new Date(dt);
    sun.setDate(sun.getDate() - toSunday);
    return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
  }
  if (granularity === "monthly") {
    if (bst != null) {
      const bd = businessDateKeyForInstant(date, tz, bst);
      return bd.slice(0, 7);
    }
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
  const { y: sy, m: sm, d: sd, h: sh } = getHourParts(start);
  let cursor = wallClockZonedHourStartFromYmdHour(sy, sm, sd, sh, tz);
  while (cursor <= end) {
    const key = getBucketKeyForDate(cursor, tz, "hourly");
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
      labels.push(labelF.format(cursor));
    }
    let parsed = parseYmdHourFromChartKey(key);
    if (!parsed) {
      const { y, m, d, h } = getHourParts(cursor);
      parsed = { y, m0: m, d, hour: h };
    }
    const n = incrementLocalWallHour(parsed.y, parsed.m0, parsed.d, parsed.hour);
    cursor = wallClockZonedHourStartFromYmdHour(n.y, n.m0, n.d, n.h, tz);
  }
  return { keys, labels };
}

function buildDailyBuckets(
  range: TimeRange,
  tz: string,
  periodType: string | undefined,
  businessStartTime?: string | undefined,
): { keys: string[]; labels: string[] } {
  const bst = businessStartTime?.trim();
  if (bst) {
    const keys = businessDateKeysIntersectingUtcRange(
      range.startAt,
      range.endAt,
      tz,
      bst,
    );
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
    const labels = keys.map((key) => {
      const { y, m0, d } = parseYmdBusinessDateKey(key);
      const cursor = getStartOfDayUtc(y, m0, d, tz);
      return showDayName ? labelFWithWeekday.format(cursor) : labelF.format(cursor);
    });
    return { keys, labels };
  }

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
  businessStartTime?: string | undefined,
): { keys: string[]; labels: string[] } {
  const bst = businessStartTime?.trim();
  if (bst) {
    const intersecting = businessDateKeysIntersectingUtcRange(
      range.startAt,
      range.endAt,
      tz,
      bst,
    );
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const dkey of intersecting) {
      const ws = sundayWeekStartYmdForBusinessDateKey(dkey, tz);
      if (!seen.has(ws)) {
        seen.add(ws);
        keys.push(ws);
      }
    }
    let weekNum = 1;
    const labels = keys.map(() => `Week ${weekNum++}`);
    return { keys, labels };
  }

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
  businessStartTime?: string | undefined,
): { keys: string[]; labels: string[] } {
  const bst = businessStartTime?.trim();
  if (bst) {
    const intersecting = businessDateKeysIntersectingUtcRange(
      range.startAt,
      range.endAt,
      tz,
      bst,
    );
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const dkey of intersecting) {
      const mk = dkey.slice(0, 7);
      if (!seen.has(mk)) {
        seen.add(mk);
        keys.push(mk);
      }
    }
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
    const startYear =
      keys.length > 0
        ? Number.parseInt(keys[0]!.slice(0, 4), 10)
        : new Date().getUTCFullYear();
    const labels = keys.map((mk) => {
      const m = /^(\d{4})-(\d{2})$/.exec(mk);
      if (!m) return mk;
      const y = Number.parseInt(m[1] ?? "0", 10);
      const month0 = Number.parseInt(m[2] ?? "0", 10) - 1;
      const cursor = getStartOfDayUtc(y, month0, 1, tz);
      if (last52weeksAllYear) {
        let label = labelFShortYear.format(cursor);
        label = label.replace(/\s*(\d{2})$/, ", $1");
        return label;
      }
      return y === startYear ? labelF.format(cursor) : labelFWithYear.format(cursor);
    });
    return { keys, labels };
  }

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
  const businessStartTime = options?.businessStartTime;

  if (granularity === "hourly") return buildHourlyBuckets(range, tz);
  if (granularity === "daily")
    return buildDailyBuckets(range, tz, periodType, businessStartTime);
  if (granularity === "weekly")
    return buildWeeklyBuckets(range, tz, businessStartTime);
  if (granularity === "monthly")
    return buildMonthlyBuckets(range, tz, periodType, businessStartTime);

  return { keys: [], labels: [] };
}

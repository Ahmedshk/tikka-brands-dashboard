/**
 * Homebase API integration for labor cost.
 * Labor cost = sum of labor.costs from timecards in the given date range.
 * See: GET /locations/{location_uuid}/timecards (start_date, end_date, date_filter=clock_in).
 */
import type { TimeRange } from "../utils/businessHours.util.js";
import { getBusinessHourSlotBounds } from "../utils/timezone.util.js";
import {
  getStartOfDayUtc,
  getDatePartsInTz,
} from "../utils/salesTrendDateRange.util.js";

const HOMEBASE_BASE = "https://api.joinhomebase.com";
const PER_PAGE = 100;

export interface HomebaseTimecardLabor {
  wage_type?: string;
  costs?: number;
  wage_rate?: number;
  regular_hours?: number;
  paid_hours?: number;
  [key: string]: unknown;
}

export interface HomebaseTimecard {
  id: number;
  user_id: number;
  job_id: number;
  labor?: HomebaseTimecardLabor;
  clock_in?: string;
  clock_out?: string;
  [key: string]: unknown;
}

function getApiKey(): string | undefined {
  return process.env.HOMEBASE_API_KEY?.trim() || undefined;
}

export interface HomebaseServiceOptions {
  apiKey?: string | undefined;
}

function resolveApiKey(override?: string): string | undefined {
  if (override != null && String(override).trim() !== "") {
    return String(override).trim();
  }
  return getApiKey();
}

async function homebaseFetch(
  path: string,
  searchParams: Record<string, string>,
  apiKeyOverride?: string,
): Promise<Response> {
  const apiKey = resolveApiKey(apiKeyOverride);
  if (!apiKey) {
    throw new Error("HOMEBASE_API_KEY is not set");
  }

  const url = new URL(path, HOMEBASE_BASE);
  Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.homebase-v1+json",
    },
  });

  if (res.status === 429) {
    const body = await res.text();
    throw new Error(`Homebase API rate limit exceeded: ${body || "429"}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Homebase API error ${res.status}: ${body || res.statusText}`,
    );
  }

  return res;
}

/**
 * Fetch all timecards for a location in a date range (paginated).
 * Uses date_filter=clock_in so start_date/end_date apply to clock-in time.
 */
export async function getTimecardsForDateRange(
  locationUuid: string,
  startAt: string,
  endAt: string,
  options?: HomebaseServiceOptions,
): Promise<HomebaseTimecard[]> {
  const all: HomebaseTimecard[] = [];
  let page = 1;

  while (true) {
    const res = await homebaseFetch(
      `/locations/${encodeURIComponent(locationUuid)}/timecards`,
      {
        start_date: startAt,
        end_date: endAt,
        date_filter: "clock_in",
        per_page: String(PER_PAGE),
        page: String(page),
      },
      options?.apiKey,
    );

    const data = (await res.json()) as HomebaseTimecard[];
    if (!Array.isArray(data)) {
      return all;
    }

    all.push(...data);

    const total = res.headers.get("Total");
    const perPage = res.headers.get("Per-Page");
    const totalNum = total ? Number.parseInt(total, 10) : data.length;
    const perPageNum = perPage ? Number.parseInt(perPage, 10) : PER_PAGE;
    if (page * perPageNum >= totalNum || data.length === 0) {
      break;
    }
    page += 1;
  }

  return all;
}

/**
 * Fetch total labor cost from Homebase timecards in the given time range.
 * Sums labor.costs for each timecard with clock_in in the range.
 */
export async function getLaborCostInRange(
  homebaseLocationId: string,
  range: TimeRange,
  options?: HomebaseServiceOptions,
): Promise<number> {
  const apiKey = resolveApiKey(options?.apiKey);
  if (!apiKey) {
    return 0;
  }

  const locationUuid = homebaseLocationId.trim();
  if (!locationUuid) {
    return 0;
  }

  const { startAt, endAt } = range;
  const timecards = await getTimecardsForDateRange(
    locationUuid,
    startAt,
    endAt,
    options,
  );

  let total = 0;
  for (const tc of timecards) {
    const costs = tc.labor?.costs;
    if (typeof costs === "number" && Number.isFinite(costs)) {
      total += costs;
    }
  }

  return total;
}

/**
 * Fetch total hours from Homebase timecards in the given time range.
 * Sums labor.paid_hours (or labor.regular_hours) for each timecard with clock_in in the range.
 */
export async function getTotalHoursInRange(
  homebaseLocationId: string,
  range: TimeRange,
  options?: HomebaseServiceOptions,
): Promise<number> {
  const apiKey = resolveApiKey(options?.apiKey);
  if (!apiKey) {
    return 0;
  }

  const locationUuid = homebaseLocationId.trim();
  if (!locationUuid) {
    return 0;
  }

  const { startAt, endAt } = range;
  const timecards = await getTimecardsForDateRange(
    locationUuid,
    startAt,
    endAt,
    options,
  );

  let total = 0;
  for (const tc of timecards) {
    const labor = tc.labor;
    const hours =
      (typeof labor?.paid_hours === "number" &&
      Number.isFinite(labor.paid_hours)
        ? labor.paid_hours
        : undefined) ??
      (typeof labor?.regular_hours === "number" &&
      Number.isFinite(labor.regular_hours)
        ? labor.regular_hours
        : undefined) ??
      0;
    total += hours;
  }

  return total;
}

/**
 * Fetch labor cost per business-hour slot (0-23) by prorating timecard labor.costs
 * by overlap with each slot. Returns 24 numbers (dollars per slot).
 */
export async function getLaborCostPerHourInRange(
  homebaseLocationId: string,
  range: TimeRange,
  timezone: string,
  businessStartTime: string,
  options?: HomebaseServiceOptions,
): Promise<number[]> {
  const apiKey = resolveApiKey(options?.apiKey);
  const result = new Array<number>(24).fill(0);
  if (!apiKey) {
    return result;
  }

  const locationUuid = homebaseLocationId.trim();
  if (!locationUuid) {
    return result;
  }

  const { startAt, endAt } = range;
  const timecards = await getTimecardsForDateRange(
    locationUuid,
    startAt,
    endAt,
    options,
  );

  const tz = timezone.trim();
  const bizStart = businessStartTime?.trim() ?? "00:00";

  for (const tc of timecards) {
    const costs = tc.labor?.costs;
    if (typeof costs !== "number" || !Number.isFinite(costs)) {
      continue;
    }
    const clockIn = tc.clock_in
      ? new Date(tc.clock_in).getTime()
      : Number.NaN;
    const clockOut = tc.clock_out
      ? new Date(tc.clock_out).getTime()
      : Number.NaN;
    if (Number.isNaN(clockIn)) continue;
    const endMs = Number.isNaN(clockOut) ? new Date(endAt).getTime() : clockOut;
    const totalMs = Math.max(0, endMs - clockIn);
    if (totalMs <= 0) continue;

    for (let slot = 0; slot < 24; slot++) {
      const { startAt: slotStartAt, endAt: slotEndAt } =
        getBusinessHourSlotBounds(tz, bizStart, slot);
      const slotStartMs = new Date(slotStartAt).getTime();
      const slotEndMs = new Date(slotEndAt).getTime() + 1;
      const overlapStart = Math.max(clockIn, slotStartMs);
      const overlapEnd = Math.min(endMs, slotEndMs);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      if (overlapMs > 0) {
        result[slot] = (result[slot] ?? 0) + (overlapMs / totalMs) * costs;
      }
    }
  }

  return result;
}

/** Granularity for sales trend time-series (must match bucket key format used by Square). */
type SalesTrendGranularity = "hourly" | "daily" | "weekly" | "monthly";

/** Get bucket key for a date in TZ (same format as Square for alignment). */
function getBucketKeyForDate(
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

/** Generate ordered bucket keys and labels for a range (same as Square for alignment). */
function getOrderedBucketsAndLabels(
  range: TimeRange,
  timezone: string,
  granularity: SalesTrendGranularity,
): { keys: string[]; labels: string[] } {
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  const tz = timezone.trim();
  const keys: string[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();

  if (granularity === "hourly") {
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
  if (granularity === "daily") {
    const labelF = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
    });
    const startParts = getDatePartsInTz(start, tz);
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
        labels.push(labelF.format(cursor));
      }
      const nextInstant = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      const nextParts = getDatePartsInTz(nextInstant, tz);
      y = nextParts.y;
      m = nextParts.m;
      d = nextParts.d;
    }
    return { keys, labels };
  }
  if (granularity === "weekly") {
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
  if (granularity === "monthly") {
    const labelF = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
    });
    const labelFWithYear = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      year: "numeric",
    });
    const startParts = getDatePartsInTz(start, tz);
    const endParts = getDatePartsInTz(end, tz);
    let y = startParts.y;
    let month0 = startParts.m;
    let lastYear: number | null = null;
    while (y < endParts.y || (y === endParts.y && month0 <= endParts.m)) {
      const cursor = getStartOfDayUtc(y, month0, 1, tz);
      const key = getBucketKeyForDate(cursor, tz, "monthly");
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
        const label = lastYear !== null && y !== lastYear ? labelFWithYear.format(cursor) : labelF.format(cursor);
        lastYear = y;
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
  return { keys, labels };
}

export interface LaborHoursTimeSeriesResult {
  labels: string[];
  laborCost: number[];
  hours: number[];
}

/**
 * Fetch timecards in range and aggregate labor cost and hours by bucket (hour/day/week) in location TZ.
 * Returns labels and arrays aligned for chart x-axis (same bucket order as Square).
 */
export async function getLaborAndHoursTimeSeriesInRange(
  homebaseLocationId: string,
  range: TimeRange,
  timezone: string,
  granularity: SalesTrendGranularity,
  options?: HomebaseServiceOptions,
): Promise<LaborHoursTimeSeriesResult> {
  const { keys, labels } = getOrderedBucketsAndLabels(range, timezone, granularity);
  const laborCostByKey: Record<string, number> = {};
  const hoursByKey: Record<string, number> = {};
  for (const k of keys) {
    laborCostByKey[k] = 0;
    hoursByKey[k] = 0;
  }

  const locationUuid = homebaseLocationId.trim();
  if (!locationUuid) {
    return { labels, laborCost: keys.map(() => 0), hours: keys.map(() => 0) };
  }

  const apiKey = resolveApiKey(options?.apiKey);
  if (!apiKey) {
    return { labels, laborCost: keys.map(() => 0), hours: keys.map(() => 0) };
  }

  const timecards = await getTimecardsForDateRange(
    locationUuid,
    range.startAt,
    range.endAt,
    options,
  );

  for (const tc of timecards) {
    const clockIn = tc.clock_in ? new Date(tc.clock_in) : null;
    if (!clockIn || Number.isNaN(clockIn.getTime())) continue;
    const key = getBucketKeyForDate(clockIn, timezone, granularity);
    if (!key || laborCostByKey[key] === undefined) continue;

    const costs = tc.labor?.costs;
    if (typeof costs === "number" && Number.isFinite(costs)) {
      laborCostByKey[key] = (laborCostByKey[key] ?? 0) + costs;
    }

    const labor = tc.labor;
    const hours =
      (typeof labor?.paid_hours === "number" && Number.isFinite(labor.paid_hours)
        ? labor.paid_hours
        : undefined) ??
      (typeof labor?.regular_hours === "number" && Number.isFinite(labor.regular_hours)
        ? labor.regular_hours
        : undefined) ??
      0;
    hoursByKey[key] = (hoursByKey[key] ?? 0) + hours;
  }

  return {
    labels,
    laborCost: keys.map((k) => laborCostByKey[k] ?? 0),
    hours: keys.map((k) => hoursByKey[k] ?? 0),
  };
}

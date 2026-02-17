/**
 * Homebase API integration for labor cost.
 * Labor cost = sum of labor.costs from timecards in the given date range.
 * See: GET /locations/{location_uuid}/timecards (start_date, end_date, date_filter=clock_in).
 */
import type { TimeRange } from "../utils/businessHours.util.js";
import { getBusinessHourSlotBounds } from "../utils/timezone.util.js";

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

/**
 * Homebase API integration for labor cost.
 * Labor cost = sum of labor.costs from timecards in the given date range.
 * See: GET /locations/{location_uuid}/timecards (start_date, end_date, date_filter=clock_in).
 */
import type { TimeRange } from "../utils/businessHours.util.js";
import { computeLaborCostPerHourFromTimecards } from "../utils/homebaseLaborHelpers.js";
import {
  getOrderedBucketsAndLabels,
  type SalesTrendGranularity,
} from "../utils/homebaseOrderedBuckets.util.js";
import { aggregateTimecardsIntoBuckets } from "../utils/homebaseTimeSeriesHelpers.js";

const HOMEBASE_BASE = "https://api.joinhomebase.com";
/** Origin for public API; use with full path /api/public/... to avoid URL() dropping path. */
const HOMEBASE_PUBLIC_ORIGIN = "https://app.joinhomebase.com";
const PER_PAGE = 100;
/** Homebase public API caps employees per page at 100 (see response header per-page). */
const EMPLOYEES_PER_PAGE = 100;

export interface HomebaseTimecardLabor {
  wage_type?: string;
  costs?: number;
  wage_rate?: number;
  regular_hours?: number;
  paid_hours?: number;
  [key: string]: unknown;
}

export interface HomebaseTimebreak {
  id: number;
  timecard_id: number;
  paid: boolean;
  duration: number;
  start_at?: string;
  end_at?: string | null;
  [key: string]: unknown;
}

export interface HomebaseTimecard {
  id: number;
  user_id: number;
  job_id: number;
  first_name?: string;
  last_name?: string;
  role?: string;
  department?: string;
  timebreaks?: HomebaseTimebreak[];
  labor?: HomebaseTimecardLabor;
  clock_in?: string;
  clock_out?: string | null;
  [key: string]: unknown;
}

/** Homebase employee job (API shape; we exclude pin when storing). */
export interface HomebaseEmployeeJob {
  id: number;
  level?: string | null;
  default_role?: string | null;
  pin?: string;
  pos_partner_id?: string | null;
  payroll_id?: string | null;
  wage_rate?: number | null;
  wage_type?: string | null;
  roles?: unknown[];
  archived_at?: string | null;
  location_uuid?: string | null;
}

/** Homebase employee from GET /locations/{uuid}/employees. */
export interface HomebaseEmployee {
  id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  job?: HomebaseEmployeeJob | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function getApiKey(): string | undefined {
  return process.env.HOMEBASE_API_KEY?.trim() || undefined;
}

export interface HomebaseServiceOptions {
  apiKey?: string | undefined;
  /** Used for label formatting (same as Square): last52weeks = month+year on all monthly; daily day-name when not today/last52weeks/thisYear */
  periodType?: string | undefined;
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
 * Fetch from Homebase public API (e.g. employees). Requires apiKey (location's key).
 */
async function homebasePublicFetch(
  path: string,
  searchParams: Record<string, string>,
  apiKey: string,
): Promise<Response> {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error("Homebase API key is required for employees endpoint");
  }

  const fullPath = path.startsWith("/")
    ? `/api/public${path}`
    : `/api/public/${path}`;
  const url = new URL(fullPath, HOMEBASE_PUBLIC_ORIGIN);
  Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
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
 * Fetch all employees for a location (paginated; includes archived).
 * Uses GET /locations/{location_uuid}/employees with page, per_page, with_archived.
 * apiKey must be the location's Homebase API key.
 */
export async function getEmployeesForLocation(
  locationUuid: string,
  apiKey: string,
): Promise<HomebaseEmployee[]> {
  const all: HomebaseEmployee[] = [];
  const uuid = locationUuid.trim();
  if (!uuid) return all;

  let page = 1;

  while (true) {
    const res = await homebasePublicFetch(
      `/locations/${encodeURIComponent(uuid)}/employees`,
      {
        page: String(page),
        per_page: String(EMPLOYEES_PER_PAGE),
        with_archived: "true",
      },
      apiKey,
    );

    const raw = (await res.json()) as unknown;
    let data: HomebaseEmployee[] = [];
    if (Array.isArray(raw)) {
      data = raw;
    } else if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.data)) data = obj.data as HomebaseEmployee[];
      else if (Array.isArray(obj.employees)) data = obj.employees as HomebaseEmployee[];
      else {
        const firstArray = Object.values(obj).find((v) => Array.isArray(v));
        if (firstArray) data = firstArray as HomebaseEmployee[];
      }
    }

    if (data.length === 0 && page === 1) {
      return all;
    }

    all.push(...data);

    if (data.length < EMPLOYEES_PER_PAGE) {
      break;
    }
    page += 1;
  }

  return all;
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
  const empty = new Array<number>(24).fill(0);
  if (!apiKey) return empty;

  const locationUuid = homebaseLocationId.trim();
  if (!locationUuid) return empty;

  const timecards = await getTimecardsForDateRange(
    locationUuid,
    range.startAt,
    range.endAt,
    options,
  );
  return computeLaborCostPerHourFromTimecards(
    timecards,
    range.endAt,
    timezone,
    businessStartTime,
  );
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
  const { keys, labels } = getOrderedBucketsAndLabels(
    range,
    timezone,
    granularity,
    options?.periodType == null
      ? undefined
      : { periodType: options.periodType },
  );
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

  aggregateTimecardsIntoBuckets(
    timecards,
    keys,
    timezone,
    granularity,
    laborCostByKey,
    hoursByKey,
  );

  return {
    labels,
    laborCost: keys.map((k) => laborCostByKey[k] ?? 0),
    hours: keys.map((k) => hoursByKey[k] ?? 0),
  };
}

/**
 * Homebase API integration for labor cost.
 * Labor cost = sum of labor.costs from timecards in the given date range.
 * See: GET /locations/{location_uuid}/timecards (start_date, end_date, date_filter=clock_in).
 */
import type { TimeRange } from "../utils/businessHours.util.js";

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

async function homebaseFetch(
  path: string,
  searchParams: Record<string, string>,
): Promise<Response> {
  const apiKey = getApiKey();
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
): Promise<number> {
  const apiKey = getApiKey();
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
): Promise<number> {
  const apiKey = getApiKey();
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

import { Types } from "mongoose";
import { GoogleBusinessReviewModel } from "../models/googleBusinessReview.model.js";
import { GoogleBusinessLocationSyncStateModel } from "../models/googleBusinessLocationSyncState.model.js";
import type { GoogleBusinessReviewPeriod } from "../types/googleBusinessReview.types.js";
import type { TimeRange } from "./businessHours.util.js";
import {
  getBusinessStartTimeRange,
  getLastWeekRange,
  getMonthToDateRange,
  getWeekToDateRange,
} from "./timezone.util.js";
import { getPreviousBusinessDayRange } from "./businessDayUtcRange.util.js";
import type { LocationForKpi } from "../types/commandCenter.types.js";

export interface ReviewRatingSummary {
  averageRating: number | null;
  reviewCount: number;
}

export type ReviewRatingSummaries = Record<'today' | 'yesterday' | 'weekToDate' | 'monthToDate' | 'lastWeek' | 'overall', ReviewRatingSummary>;

type ReviewGroup = { _id: Types.ObjectId; count: number; sum: number };

function emptyReviewSummaries(): ReviewRatingSummaries {
  const empty = () => ({ averageRating: null, reviewCount: 0 });
  return { today: empty(), yesterday: empty(), weekToDate: empty(), monthToDate: empty(), lastWeek: empty(), overall: empty() };
}

/** Keep raw sums until the combined average is computed, avoiding rounded-average drift. */
export function summarizeReviewGroups(rows: ReviewGroup[]): { combined: ReviewRatingSummary; byLocation: Map<string, ReviewRatingSummary> } {
  let count = 0;
  let sum = 0;
  const byLocation = new Map<string, ReviewRatingSummary>();
  for (const row of rows) {
    count += row.count;
    sum += row.sum;
    byLocation.set(String(row._id), { averageRating: row.count > 0 ? roundRating(row.sum / row.count) : null, reviewCount: row.count });
  }
  return { combined: { averageRating: count > 0 ? roundRating(sum / count) : null, reviewCount: count }, byLocation };
}

/** One grouped query per period supplies both the total and all location rows. */
export async function getReviewRatingBreakdownForLocations(
  locationIds: string[], locations: LocationForKpi[],
): Promise<{ combined: ReviewRatingSummaries; byLocation: Map<string, ReviewRatingSummaries> }> {
  const combined = emptyReviewSummaries();
  const byLocation = new Map<string, ReviewRatingSummaries>();
  const contexts = locationIds.flatMap((id, index) => {
    const loc = locations[index];
    if (!loc || byLocation.has(id)) return [];
    byLocation.set(id, emptyReviewSummaries());
    const start = loc.businessStartTime ?? '00:00';
    return [{ id, ranges: {
      today: getBusinessStartTimeRange(loc.timezone, start),
      yesterday: getPreviousBusinessDayRange(loc.timezone, start),
      weekToDate: getWeekToDateRange(loc.timezone, start),
      monthToDate: getMonthToDateRange(loc.timezone, start),
      lastWeek: getLastWeekRange(loc.timezone),
    } }];
  });
  if (!contexts.length) return { combined, byLocation };
  const [, states] = await Promise.all([
    Promise.all((['today', 'yesterday', 'weekToDate', 'monthToDate', 'lastWeek'] as const).map(async period => {
    const rows = await GoogleBusinessReviewModel.aggregate<ReviewGroup>([
      { $match: { $or: contexts.map(({ id, ranges }) => ({
        locationId: new Types.ObjectId(id),
        createTime: { $gte: new Date(ranges[period].startAt), $lte: new Date(ranges[period].endAt) },
      })) } },
      { $group: { _id: '$locationId', count: { $sum: 1 }, sum: { $sum: '$starRatingNumeric' } } },
    ]);
    const summary = summarizeReviewGroups(rows);
    combined[period] = summary.combined;
    for (const [id, value] of summary.byLocation) {
      const target = byLocation.get(id);
      if (target) target[period] = value;
    }
    })),
    GoogleBusinessLocationSyncStateModel.find({
      locationId: { $in: contexts.map(({ id }) => new Types.ObjectId(id)) }, lastSyncStatus: 'success',
    }).select('locationId googleTotalReviewCount googleAverageRating').lean(),
  ]);
  combined.overall = computeWeightedReviewSummaryFromStates(states);
  for (const state of states) {
    const target = byLocation.get(String(state.locationId));
    if (target) target.overall = computeWeightedReviewSummaryFromStates([state]);
  }
  return { combined, byLocation };
}

function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function aggregateReviewRatingForMatch(
  match: Record<string, unknown>,
): Promise<ReviewRatingSummary> {
  const [row] = await GoogleBusinessReviewModel.aggregate<{
    _id: null;
    count: number;
    sum: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        sum: { $sum: "$starRatingNumeric" },
      },
    },
  ]);

  if (!row || row.count === 0) {
    return { averageRating: null, reviewCount: 0 };
  }

  return {
    averageRating: roundRating(row.sum / row.count),
    reviewCount: row.count,
  };
}

export async function aggregateReviewRatingForRange(
  locationIds: string[],
  range: TimeRange | null,
): Promise<ReviewRatingSummary> {
  if (locationIds.length === 0) {
    return { averageRating: null, reviewCount: 0 };
  }

  const oids = locationIds.map((id) => new Types.ObjectId(id));
  const match: Record<string, unknown> = { locationId: { $in: oids } };
  if (range) {
    match.createTime = { $gte: new Date(range.startAt), $lte: new Date(range.endAt) };
  }

  return aggregateReviewRatingForMatch(match);
}

export function computeWeightedReviewSummaryFromStates(
  states: Array<{ googleTotalReviewCount?: number | null; googleAverageRating?: number | null }>,
): ReviewRatingSummary {
  let totalCount = 0;
  let weightedSum = 0;
  for (const s of states) {
    const count = s.googleTotalReviewCount ?? 0;
    const avg = s.googleAverageRating ?? 0;
    if (count <= 0) continue;
    totalCount += count;
    weightedSum += avg * count;
  }

  if (totalCount === 0) {
    return { averageRating: null, reviewCount: 0 };
  }

  return {
    averageRating: roundRating(weightedSum / totalCount),
    reviewCount: totalCount,
  };
}

export async function aggregateOverallReviewRatingFromSyncState(
  locationIds: string[],
): Promise<ReviewRatingSummary> {
  if (locationIds.length === 0) {
    return { averageRating: null, reviewCount: 0 };
  }

  const oids = locationIds.map((id) => new Types.ObjectId(id));
  const states = await GoogleBusinessLocationSyncStateModel.find({
    locationId: { $in: oids },
    lastSyncStatus: "success",
  })
    .select("googleTotalReviewCount googleAverageRating")
    .lean();

  return computeWeightedReviewSummaryFromStates(states);
}

export function resolveReviewPeriodRange(
  period: GoogleBusinessReviewPeriod,
  location: LocationForKpi,
  customStart?: string,
  customEnd?: string,
): TimeRange | null {
  const tz = location.timezone;
  const businessStart = location.businessStartTime ?? "00:00";

  switch (period) {
    case "today":
      return getBusinessStartTimeRange(tz, businessStart);
    case "weekToDate":
      return getWeekToDateRange(tz, businessStart);
    case "month":
      return getMonthToDateRange(tz, businessStart);
    case "custom": {
      if (!customStart || !customEnd) return null;
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return { startAt: start.toISOString(), endAt: end.toISOString() };
    }
    case "all":
      return null;
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

export async function getReviewRatingSummariesForLocation(
  location: LocationForKpi,
  locationMongoId: string,
): Promise<{
  today: ReviewRatingSummary;
  yesterday: ReviewRatingSummary;
  weekToDate: ReviewRatingSummary;
  monthToDate: ReviewRatingSummary;
  lastWeek: ReviewRatingSummary;
  overall: ReviewRatingSummary;
}> {
  const loc = location;
  const businessStart = loc.businessStartTime ?? "00:00";
  const todayRange = getBusinessStartTimeRange(loc.timezone, businessStart);
  const yesterdayRange = getPreviousBusinessDayRange(loc.timezone, businessStart);
  const wtdRange = getWeekToDateRange(loc.timezone, businessStart);
  const mtdRange = getMonthToDateRange(loc.timezone, businessStart);
  const lastWeekRange = getLastWeekRange(loc.timezone);

  const [today, yesterday, weekToDate, monthToDate, lastWeek, overall] = await Promise.all([
    aggregateReviewRatingForRange([locationMongoId], todayRange),
    aggregateReviewRatingForRange([locationMongoId], yesterdayRange),
    aggregateReviewRatingForRange([locationMongoId], wtdRange),
    aggregateReviewRatingForRange([locationMongoId], mtdRange),
    aggregateReviewRatingForRange([locationMongoId], lastWeekRange),
    aggregateOverallReviewRatingFromSyncState([locationMongoId]),
  ]);

  return { today, yesterday, weekToDate, monthToDate, lastWeek, overall };
}

export async function getReviewRatingSummariesForLocations(
  locationIds: string[],
  locations: LocationForKpi[],
): Promise<{
  today: ReviewRatingSummary;
  yesterday: ReviewRatingSummary;
  weekToDate: ReviewRatingSummary;
  monthToDate: ReviewRatingSummary;
  lastWeek: ReviewRatingSummary;
  overall: ReviewRatingSummary;
}> {
  const empty = { averageRating: null, reviewCount: 0 };
  if (locationIds.length === 0) {
    return {
      today: empty,
      yesterday: empty,
      weekToDate: empty,
      monthToDate: empty,
      lastWeek: empty,
      overall: empty,
    };
  }

  const primary = locations[0];
  if (!primary) {
    return {
      today: empty,
      yesterday: empty,
      weekToDate: empty,
      monthToDate: empty,
      lastWeek: empty,
      overall: empty,
    };
  }

  const businessStart = primary.businessStartTime ?? "00:00";
  const todayRange = getBusinessStartTimeRange(primary.timezone, businessStart);
  const yesterdayRange = getPreviousBusinessDayRange(primary.timezone, businessStart);
  const wtdRange = getWeekToDateRange(primary.timezone, businessStart);
  const mtdRange = getMonthToDateRange(primary.timezone, businessStart);
  const lastWeekRange = getLastWeekRange(primary.timezone);

  const [today, yesterday, weekToDate, monthToDate, lastWeek, overall] = await Promise.all([
    aggregateReviewRatingForRange(locationIds, todayRange),
    aggregateReviewRatingForRange(locationIds, yesterdayRange),
    aggregateReviewRatingForRange(locationIds, wtdRange),
    aggregateReviewRatingForRange(locationIds, mtdRange),
    aggregateReviewRatingForRange(locationIds, lastWeekRange),
    aggregateOverallReviewRatingFromSyncState(locationIds),
  ]);

  return { today, yesterday, weekToDate, monthToDate, lastWeek, overall };
}

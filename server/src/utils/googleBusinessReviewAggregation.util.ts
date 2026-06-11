import { Types } from "mongoose";
import { GoogleBusinessReviewModel } from "../models/googleBusinessReview.model.js";
import { GoogleBusinessLocationSyncStateModel } from "../models/googleBusinessLocationSyncState.model.js";
import type { GoogleBusinessReviewPeriod } from "../types/googleBusinessReview.types.js";
import type { TimeRange } from "./businessHours.util.js";
import {
  getBusinessStartTimeRange,
  getStartOfDayUtc,
  getTodayInTimezone,
  getWeekToDateRange,
} from "./timezone.util.js";
import type { LocationForKpi } from "../types/commandCenter.types.js";

export interface ReviewRatingSummary {
  averageRating: number | null;
  reviewCount: number;
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
  weekToDate: ReviewRatingSummary;
  overall: ReviewRatingSummary;
}> {
  const loc = location;
  const todayRange = getBusinessStartTimeRange(loc.timezone, loc.businessStartTime ?? "00:00");
  const wtdRange = getWeekToDateRange(loc.timezone, loc.businessStartTime ?? "00:00");

  const [today, weekToDate, overall] = await Promise.all([
    aggregateReviewRatingForRange([locationMongoId], todayRange),
    aggregateReviewRatingForRange([locationMongoId], wtdRange),
    aggregateOverallReviewRatingFromSyncState([locationMongoId]),
  ]);

  return { today, weekToDate, overall };
}

export async function getReviewRatingSummariesForLocations(
  locationIds: string[],
  locations: LocationForKpi[],
): Promise<{
  today: ReviewRatingSummary;
  weekToDate: ReviewRatingSummary;
  overall: ReviewRatingSummary;
}> {
  if (locationIds.length === 0) {
    return {
      today: { averageRating: null, reviewCount: 0 },
      weekToDate: { averageRating: null, reviewCount: 0 },
      overall: { averageRating: null, reviewCount: 0 },
    };
  }

  const primary = locations[0];
  if (!primary) {
    return {
      today: { averageRating: null, reviewCount: 0 },
      weekToDate: { averageRating: null, reviewCount: 0 },
      overall: { averageRating: null, reviewCount: 0 },
    };
  }

  const todayRange = getBusinessStartTimeRange(
    primary.timezone,
    primary.businessStartTime ?? "00:00",
  );
  const wtdRange = getWeekToDateRange(primary.timezone, primary.businessStartTime ?? "00:00");

  const [today, weekToDate, overall] = await Promise.all([
    aggregateReviewRatingForRange(locationIds, todayRange),
    aggregateReviewRatingForRange(locationIds, wtdRange),
    aggregateOverallReviewRatingFromSyncState(locationIds),
  ]);

  return { today, weekToDate, overall };
}

function getMonthToDateRange(timezone: string, businessStartTime: string): TimeRange {
  const todayYmd = getTodayInTimezone(timezone);
  const parts = todayYmd.split("-").map((v) => Number.parseInt(v, 10));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const startDate = getStartOfDayUtc(y, m - 1, 1, timezone);
  const { endAt } = getBusinessStartTimeRange(timezone, businessStartTime);
  return { startAt: startDate.toISOString(), endAt };
}

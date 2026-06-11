import { Types } from "mongoose";
import { GoogleBusinessReviewModel } from "../models/googleBusinessReview.model.js";
import { LocationRepository } from "../repositories/location.repository.js";
import type { GoogleBusinessReviewPeriod } from "../types/googleBusinessReview.types.js";
import {
  aggregateOverallReviewRatingFromSyncState,
  aggregateReviewRatingForMatch,
  aggregateReviewRatingForRange,
  resolveReviewPeriodRange,
} from "../utils/googleBusinessReviewAggregation.util.js";
import type { LocationForKpi } from "../types/commandCenter.types.js";

const locationRepository = new LocationRepository();

export interface ListGoogleBusinessReviewsParams {
  locationIds: string[];
  period: GoogleBusinessReviewPeriod;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
  minRating?: number;
  maxRating?: number;
}

function toLocationForKpi(doc: {
  timezone?: string;
  businessStartTime?: string;
}): LocationForKpi {
  return {
    timezone: doc.timezone ?? "America/Denver",
    businessStartTime: doc.businessStartTime ?? "00:00",
    squareLocationId: null,
    homebaseLocationId: null,
  };
}

export async function listGoogleBusinessReviewsForParams(
  params: ListGoogleBusinessReviewsParams,
) {
  const { locationIds, period, page, limit } = params;
  if (locationIds.length === 0) {
    return {
      reviews: [],
      summary: { averageRating: null, reviewCount: 0 },
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  const firstLoc = await locationRepository.findById(locationIds[0]!);
  const locationForRange = toLocationForKpi(firstLoc ?? {});
  const range = resolveReviewPeriodRange(
    period,
    locationForRange,
    params.startDate,
    params.endDate,
  );

  const oids = locationIds.map((id) => new Types.ObjectId(id));
  const match: Record<string, unknown> = { locationId: { $in: oids } };
  if (range) {
    match.createTime = { $gte: new Date(range.startAt), $lte: new Date(range.endAt) };
  }
  if (params.minRating != null || params.maxRating != null) {
    const rating: Record<string, number> = {};
    if (params.minRating != null) rating.$gte = params.minRating;
    if (params.maxRating != null) rating.$lte = params.maxRating;
    match.starRatingNumeric = rating;
  }

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    GoogleBusinessReviewModel.find(match)
      .sort({ createTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GoogleBusinessReviewModel.countDocuments(match),
  ]);

  const nameById = new Map<string, string>();
  if (locationIds.length > 1) {
    const docs = await locationRepository.findAll();
    for (const d of docs) {
      nameById.set(String(d._id), d.storeName);
    }
  }

  const hasRatingFilter = params.minRating != null || params.maxRating != null;
  const summary = hasRatingFilter
    ? await aggregateReviewRatingForMatch(match)
    : period === "all" && locationIds.length === 1
      ? await aggregateOverallReviewRatingFromSyncState(locationIds)
      : await aggregateReviewRatingForRange(locationIds, range);

  return {
    reviews: rows.map((r) => ({
      _id: String(r._id),
      locationId: String(r.locationId),
      locationName: nameById.get(String(r.locationId)),
      googleReviewId: r.googleReviewId,
      googleReviewName: r.googleReviewName,
      starRating: r.starRating,
      starRatingNumeric: r.starRatingNumeric,
      comment: r.comment,
      reviewer: r.reviewer,
      createTime: r.createTime.toISOString(),
      updateTime: r.updateTime.toISOString(),
      reviewReply: r.reviewReply
        ? {
            comment: r.reviewReply.comment,
            updateTime: r.reviewReply.updateTime.toISOString(),
          }
        : undefined,
    })),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}

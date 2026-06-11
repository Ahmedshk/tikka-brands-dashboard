import { Types } from "mongoose";
import { GoogleBusinessReviewModel } from "../models/googleBusinessReview.model.js";
import { GoogleBusinessLocationSyncStateModel } from "../models/googleBusinessLocationSyncState.model.js";
import { listAllGoogleBusinessReviews } from "./googleBusinessProfile.service.js";
import { isGoogleBusinessConnected } from "./googleBusinessConnection.service.js";
import { LocationRepository } from "../repositories/location.repository.js";
import type { GoogleBusinessReviewSyncResult } from "../types/googleBusinessReview.types.js";
import {
  getReplyUpdateTimeMs,
  getReviewUpdateTimeMs,
  hasReviewContentChanged,
  buildReviewUpsertUpdate,
  mapApiReviewToDocument,
} from "../utils/googleBusinessReviewHelpers.js";
import { logger } from "../utils/logger.util.js";

const BULK_CHUNK_SIZE = 200;
const locationRepository = new LocationRepository();

const inMemorySyncLocks = new Set<string>();

export interface LocationGbpIds {
  locationMongoId: string;
  googleBusinessAccountId: string;
  googleBusinessLocationId: string;
  storeName?: string;
}

export async function listGbpMappedLocations(
  locationIds?: string[],
): Promise<LocationGbpIds[]> {
  let docs = await locationRepository.findAll();
  if (locationIds?.length) {
    const allow = new Set(locationIds.map(String));
    docs = docs.filter((d) => allow.has(String(d._id)));
  }

  return docs
    .filter((d) => d.googleBusinessAccountId?.trim() && d.googleBusinessLocationId?.trim())
    .map((d) => ({
      locationMongoId: String(d._id),
      googleBusinessAccountId: d.googleBusinessAccountId!.trim(),
      googleBusinessLocationId: d.googleBusinessLocationId!.trim(),
      storeName: d.storeName,
    }));
}

async function loadExistingReviewIndex(
  locationId: string,
): Promise<Map<string, { updateTimeMs: number; replyUpdateTimeMs?: number }>> {
  const rows = await GoogleBusinessReviewModel.find({ locationId })
    .select("googleReviewId updateTime reviewReply.updateTime")
    .lean();
  const map = new Map<string, { updateTimeMs: number; replyUpdateTimeMs?: number }>();
  for (const row of rows) {
    const entry: { updateTimeMs: number; replyUpdateTimeMs?: number } = {
      updateTimeMs: getReviewUpdateTimeMs(row.updateTime),
    };
    const replyMs = getReplyUpdateTimeMs(row.reviewReply);
    if (replyMs != null) entry.replyUpdateTimeMs = replyMs;
    map.set(row.googleReviewId, entry);
  }
  return map;
}

export async function syncGoogleBusinessReviewsForLocation(
  ids: LocationGbpIds,
): Promise<GoogleBusinessReviewSyncResult> {
  const locationId = ids.locationMongoId;
  const result: GoogleBusinessReviewSyncResult = {
    locationId,
    inserted: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    diff: [],
    errors: [],
  };

  if (inMemorySyncLocks.has(locationId)) {
    result.errors.push("Sync already running for this location");
    return result;
  }

  if (!(await isGoogleBusinessConnected())) {
    result.errors.push("Google Business Profile is not connected");
    return result;
  }

  inMemorySyncLocks.add(locationId);
  const syncedAt = new Date();

  try {
    await GoogleBusinessLocationSyncStateModel.findOneAndUpdate(
      { locationId: new Types.ObjectId(locationId) },
      {
        locationId: new Types.ObjectId(locationId),
        googleAccountId: ids.googleBusinessAccountId,
        googleLocationId: ids.googleBusinessLocationId,
        lastSyncStartedAt: syncedAt,
        lastSyncStatus: "running",
        lastSyncError: undefined,
      },
      { upsert: true },
    );

    const existingIndex = await loadExistingReviewIndex(locationId);
    const { reviews, totalReviewCount, averageRating } = await listAllGoogleBusinessReviews(
      ids.googleBusinessAccountId,
      ids.googleBusinessLocationId,
    );

    const fetchedIds = new Set<string>();
    const bulkOps: Parameters<typeof GoogleBusinessReviewModel.bulkWrite>[0] = [];

    for (const apiReview of reviews) {
      fetchedIds.add(apiReview.reviewId);
      const existing = existingIndex.get(apiReview.reviewId);
      const isNew = !existing;

      if (!hasReviewContentChanged(existing, apiReview)) {
        result.skipped += 1;
        continue;
      }

      const mapped = mapApiReviewToDocument(
        apiReview,
        new Types.ObjectId(locationId),
        syncedAt,
      );

      bulkOps.push({
        updateOne: {
          filter: { locationId: new Types.ObjectId(locationId), googleReviewId: apiReview.reviewId },
          update: buildReviewUpsertUpdate(mapped, syncedAt),
          upsert: true,
        },
      });

      result.diff.push({
        googleReviewId: apiReview.reviewId,
        starRatingNumeric: mapped.starRatingNumeric,
        reviewerDisplayName: mapped.reviewer.displayName,
        ...(mapped.comment != null ? { comment: mapped.comment } : {}),
        updateTime: mapped.updateTime,
        isNew,
      });

      if (isNew) {
        result.inserted += 1;
      } else {
        result.updated += 1;
      }

      if (bulkOps.length >= BULK_CHUNK_SIZE) {
        await GoogleBusinessReviewModel.bulkWrite(bulkOps, { ordered: false });
        bulkOps.length = 0;
      }
    }

    if (bulkOps.length > 0) {
      await GoogleBusinessReviewModel.bulkWrite(bulkOps, { ordered: false });
    }

    const deleteResult = await GoogleBusinessReviewModel.deleteMany({
      locationId: new Types.ObjectId(locationId),
      googleReviewId: { $nin: [...fetchedIds] },
    });
    result.deleted = deleteResult.deletedCount ?? 0;

    const reviewsInDb = await GoogleBusinessReviewModel.countDocuments({
      locationId: new Types.ObjectId(locationId),
    });

    await GoogleBusinessLocationSyncStateModel.findOneAndUpdate(
      { locationId: new Types.ObjectId(locationId) },
      {
        googleAccountId: ids.googleBusinessAccountId,
        googleLocationId: ids.googleBusinessLocationId,
        googleTotalReviewCount: totalReviewCount,
        googleAverageRating: averageRating,
        lastSyncCompletedAt: syncedAt,
        lastSyncStatus: "success",
        lastSyncError: undefined,
        reviewsInDb,
        lastPageToken: undefined,
      },
      { upsert: true },
    );

    logger.info("[GoogleBusiness] sync completed", {
      locationId,
      inserted: result.inserted,
      updated: result.updated,
      deleted: result.deleted,
      skipped: result.skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    await GoogleBusinessLocationSyncStateModel.findOneAndUpdate(
      { locationId: new Types.ObjectId(locationId) },
      {
        lastSyncStatus: "error",
        lastSyncError: msg,
      },
    );
    logger.error("[GoogleBusiness] sync failed", { locationId, err });
  } finally {
    inMemorySyncLocks.delete(locationId);
  }

  return result;
}

export async function syncGoogleBusinessReviewsForAllLocations(
  locationIds?: string[],
): Promise<GoogleBusinessReviewSyncResult[]> {
  const mapped = await listGbpMappedLocations(locationIds);
  const results: GoogleBusinessReviewSyncResult[] = [];
  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.LOCATION_FANOUT_CONCURRENCY ?? "2", 10) || 2,
  );

  for (let i = 0; i < mapped.length; i += concurrency) {
    const batch = mapped.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((loc) => syncGoogleBusinessReviewsForLocation(loc)),
    );
    results.push(...batchResults);
  }

  return results;
}

export async function syncGoogleBusinessReviewsCountsForLocation(
  locationId: string,
): Promise<{ upserted: number; errors: string[] }> {
  const mapped = await listGbpMappedLocations([locationId]);
  const loc = mapped[0];
  if (!loc) {
    return { upserted: 0, errors: ["Location not mapped to Google Business Profile"] };
  }
  const r = await syncGoogleBusinessReviewsForLocation(loc);
  return {
    upserted: r.inserted + r.updated,
    errors: r.errors,
  };
}

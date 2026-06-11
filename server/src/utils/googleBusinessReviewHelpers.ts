import type { Types } from "mongoose";
import type {
  GoogleBusinessApiReview,
  GoogleStarRating,
  IGoogleBusinessReview,
} from "../types/googleBusinessReview.types.js";

export function starRatingToNumeric(rating: GoogleStarRating): number {
  switch (rating) {
    case "ONE":
      return 1;
    case "TWO":
      return 2;
    case "THREE":
      return 3;
    case "FOUR":
      return 4;
    case "FIVE":
      return 5;
    default: {
      const _exhaustive: never = rating;
      return _exhaustive;
    }
  }
}

export function parseGoogleIsoDate(iso: string): Date {
  return new Date(iso);
}

export interface ExistingReviewSyncIndex {
  updateTimeMs: number;
  replyUpdateTimeMs?: number;
}

export function getReviewUpdateTimeMs(updateTime: Date | string): number {
  return new Date(updateTime).getTime();
}

export function getReplyUpdateTimeMs(
  reply: { updateTime?: Date | string } | undefined | null,
): number | undefined {
  if (!reply?.updateTime) return undefined;
  return getReviewUpdateTimeMs(reply.updateTime);
}

/**
 * Returns true when the API review differs from what we already have stored.
 */
export function hasReviewContentChanged(
  existing: ExistingReviewSyncIndex | undefined,
  apiReview: GoogleBusinessApiReview,
): boolean {
  if (!existing) return true;
  const apiUpdateMs = getReviewUpdateTimeMs(apiReview.updateTime);
  if (existing.updateTimeMs !== apiUpdateMs) return true;
  const apiReplyMs = apiReview.reviewReply?.updateTime
    ? getReviewUpdateTimeMs(apiReview.reviewReply.updateTime)
    : undefined;
  if ((existing.replyUpdateTimeMs ?? undefined) !== (apiReplyMs ?? undefined)) {
    return true;
  }
  return false;
}

export function mapApiReviewToDocument(
  apiReview: GoogleBusinessApiReview,
  locationId: Types.ObjectId | string,
  syncedAt: Date,
): Omit<IGoogleBusinessReview, "_id" | "createdAt" | "updatedAt"> {
  const doc: Omit<IGoogleBusinessReview, "_id" | "createdAt" | "updatedAt"> = {
    locationId,
    googleReviewId: apiReview.reviewId,
    googleReviewName: apiReview.name,
    starRating: apiReview.starRating,
    starRatingNumeric: starRatingToNumeric(apiReview.starRating),
    reviewer: {
      displayName: apiReview.reviewer.displayName,
      profilePhotoUrl: apiReview.reviewer.profilePhotoUrl,
    },
    createTime: parseGoogleIsoDate(apiReview.createTime),
    updateTime: parseGoogleIsoDate(apiReview.updateTime),
    firstSyncedAt: syncedAt,
    lastSyncedAt: syncedAt,
  };

  if (apiReview.comment != null && apiReview.comment !== "") {
    doc.comment = apiReview.comment;
  }

  if (apiReview.reviewReply) {
    doc.reviewReply = {
      comment: apiReview.reviewReply.comment,
      updateTime: parseGoogleIsoDate(apiReview.reviewReply.updateTime),
    };
  }

  return doc;
}

/** MongoDB forbids the same path in both $set and $setOnInsert on upsert. */
export function buildReviewUpsertUpdate(
  mapped: Omit<IGoogleBusinessReview, "_id" | "createdAt" | "updatedAt">,
  syncedAt: Date,
): {
  $set: Omit<
    Omit<IGoogleBusinessReview, "_id" | "createdAt" | "updatedAt">,
    "firstSyncedAt"
  >;
  $setOnInsert: { firstSyncedAt: Date };
} {
  const { firstSyncedAt: _omitFirstSyncedAt, ...setFields } = mapped;
  return {
    $set: { ...setFields, lastSyncedAt: syncedAt },
    $setOnInsert: { firstSyncedAt: syncedAt },
  };
}

export function buildLowRatingReviewFireKey(
  googleReviewId: string,
  updateTime: Date | string,
): string {
  return `low_rating_review_${googleReviewId}_${getReviewUpdateTimeMs(updateTime)}`;
}

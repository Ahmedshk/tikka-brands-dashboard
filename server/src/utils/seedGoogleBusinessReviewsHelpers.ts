import type { Types } from "mongoose";
import type { GoogleStarRating } from "../types/googleBusinessReview.types.js";
import { starRatingToNumeric } from "./googleBusinessReviewHelpers.js";

export const SEED_GBP_LOCATION_IDS = [
  "697ca45bd1dd7c973675fbb4",
  "697cad0132fe501622c8c78a",
  "6997f00c6d8d311595a17b62",
] as const;

export const SEED_GBP_REVIEW_ID_PREFIX = "seed-gbp-";

export interface SeedGoogleBusinessReviewSpec {
  idSuffix: string;
  starRating: GoogleStarRating;
  reviewerDisplayName: string;
  comment?: string;
  /** Days before now for createTime (fractional ok). */
  createdDaysAgo: number;
  /**
   * Days before now for updateTime. When omitted, equals createdDaysAgo.
   * Use a smaller value than createdDaysAgo to show the Updated tag in the UI.
   */
  updatedDaysAgo?: number;
  /** When set, updateTime is this many hours before now (overrides updatedDaysAgo). For alert testing. */
  updatedHoursAgo?: number;
  withOwnerReply?: boolean;
}

export interface SeedGoogleBusinessReviewDoc {
  locationId: Types.ObjectId;
  googleReviewId: string;
  googleReviewName: string;
  starRating: GoogleStarRating;
  starRatingNumeric: number;
  comment?: string;
  reviewer: { displayName: string; profilePhotoUrl: string };
  createTime: Date;
  updateTime: Date;
  reviewReply?: { comment: string; updateTime: Date };
  firstSyncedAt: Date;
  lastSyncedAt: Date;
}

const DEFAULT_REVIEWER_PHOTO = "https://lh3.googleusercontent.com/a/default-user=s120-c-rp-mo-br100";

export function seedGoogleReviewId(locationId: string, idSuffix: string): string {
  return `${SEED_GBP_REVIEW_ID_PREFIX}${locationId.slice(-6)}-${idSuffix}`;
}

function subtractDays(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

function subtractHours(from: Date, hours: number): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}

export function resolveSeedReviewUpdateTime(
  syncedAt: Date,
  spec: SeedGoogleBusinessReviewSpec,
): Date {
  if (spec.updatedHoursAgo != null) {
    return subtractHours(syncedAt, spec.updatedHoursAgo);
  }
  const updatedDaysAgo = spec.updatedDaysAgo ?? spec.createdDaysAgo;
  return subtractDays(syncedAt, updatedDaysAgo);
}

export function buildSeedGoogleBusinessReviewDoc(
  locationId: Types.ObjectId,
  locationIdStr: string,
  spec: SeedGoogleBusinessReviewSpec,
  syncedAt: Date,
): SeedGoogleBusinessReviewDoc {
  const googleReviewId = seedGoogleReviewId(locationIdStr, spec.idSuffix);
  const createTime = subtractDays(syncedAt, spec.createdDaysAgo);
  const updateTime = resolveSeedReviewUpdateTime(syncedAt, spec);

  const doc: SeedGoogleBusinessReviewDoc = {
    locationId,
    googleReviewId,
    googleReviewName: `accounts/seed/locations/seed/reviews/${googleReviewId}`,
    starRating: spec.starRating,
    starRatingNumeric: starRatingToNumeric(spec.starRating),
    reviewer: {
      displayName: spec.reviewerDisplayName,
      profilePhotoUrl: DEFAULT_REVIEWER_PHOTO,
    },
    createTime,
    updateTime,
    firstSyncedAt: syncedAt,
    lastSyncedAt: syncedAt,
  };

  if (spec.comment?.trim()) {
    doc.comment = spec.comment.trim();
  }

  if (spec.withOwnerReply) {
    doc.reviewReply = {
      comment: "Thank you for your feedback — we appreciate you dining with us.",
      updateTime: subtractHours(syncedAt, Math.max(0.5, (spec.updatedHoursAgo ?? 12) - 0.25)),
    };
  }

  return doc;
}

/** Default review mix per location: ratings spread, Updated tag, and recent low ratings for alert QA. */
export function defaultSeedReviewSpecsForLocation(locationIndex: number): SeedGoogleBusinessReviewSpec[] {
  const suffix = String(locationIndex + 1);
  return [
    {
      idSuffix: `five-star-${suffix}`,
      starRating: "FIVE",
      reviewerDisplayName: "Jordan Lee",
      comment: "Excellent food and friendly staff. Will definitely be back!",
      createdDaysAgo: 45,
    },
    {
      idSuffix: `four-star-${suffix}`,
      starRating: "FOUR",
      reviewerDisplayName: "Sam Rivera",
      comment: "Great tikka masala; service was a little slow on a busy night.",
      createdDaysAgo: 12,
      updatedDaysAgo: 12,
    },
    {
      idSuffix: `updated-three-star-${suffix}`,
      starRating: "THREE",
      reviewerDisplayName: "Casey Morgan",
      comment: "Portions were good after we asked — originally felt small.",
      createdDaysAgo: 20,
      updatedDaysAgo: 3,
    },
    {
      idSuffix: `recent-two-star-${suffix}`,
      starRating: "TWO",
      reviewerDisplayName: "Alex Kim",
      comment: "Order was missing items. Hoping this was a one-off.",
      createdDaysAgo: 2,
      updatedHoursAgo: 0.5,
      withOwnerReply: true,
    },
    {
      idSuffix: `recent-one-star-${suffix}`,
      starRating: "ONE",
      reviewerDisplayName: "Taylor Brooks",
      comment: "Long wait and cold entree. Disappointed with this visit.",
      createdDaysAgo: 1,
      updatedHoursAgo: 0.25,
    },
    {
      idSuffix: `rating-only-${suffix}`,
      starRating: "FIVE",
      reviewerDisplayName: "Google User",
      createdDaysAgo: 7,
      updatedDaysAgo: 7,
    },
  ];
}

export function computeAverageRatingFromDocs(
  docs: Array<{ starRatingNumeric: number }>,
): number {
  if (docs.length === 0) return 0;
  const sum = docs.reduce((acc, d) => acc + d.starRatingNumeric, 0);
  return Math.round((sum / docs.length) * 10) / 10;
}

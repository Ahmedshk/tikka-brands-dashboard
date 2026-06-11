import type { Types } from "mongoose";

export const GOOGLE_STAR_RATINGS = ["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const;
export type GoogleStarRating = (typeof GOOGLE_STAR_RATINGS)[number];

export interface GoogleBusinessApiReviewer {
  displayName: string;
  profilePhotoUrl: string;
}

export interface GoogleBusinessApiReviewReply {
  comment: string;
  updateTime: string;
}

export interface GoogleBusinessApiReview {
  reviewId: string;
  name: string;
  starRating: GoogleStarRating;
  comment?: string | undefined;
  createTime: string;
  updateTime: string;
  reviewer: GoogleBusinessApiReviewer;
  reviewReply?: GoogleBusinessApiReviewReply;
}

export interface GoogleBusinessApiReviewsListResponse {
  reviews?: GoogleBusinessApiReview[];
  totalReviewCount?: number;
  averageRating?: number;
  nextPageToken?: string;
}

export interface IGoogleBusinessReviewReply {
  comment: string;
  updateTime: Date;
}

export interface IGoogleBusinessReviewer {
  displayName: string;
  profilePhotoUrl: string;
}

export interface IGoogleBusinessReview {
  _id?: string;
  locationId: Types.ObjectId | string;
  googleReviewId: string;
  googleReviewName: string;
  starRating: GoogleStarRating;
  starRatingNumeric: number;
  comment?: string | undefined;
  reviewer: IGoogleBusinessReviewer;
  createTime: Date;
  updateTime: Date;
  reviewReply?: IGoogleBusinessReviewReply;
  firstSyncedAt: Date;
  lastSyncedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GoogleBusinessLocationSyncStatus = "idle" | "running" | "success" | "error";

export interface IGoogleBusinessLocationSyncState {
  _id?: string;
  locationId: Types.ObjectId | string;
  googleAccountId: string;
  googleLocationId: string;
  googleTotalReviewCount: number;
  googleAverageRating: number;
  lastSyncStartedAt?: Date;
  lastSyncCompletedAt?: Date;
  lastSyncStatus: GoogleBusinessLocationSyncStatus;
  lastSyncError?: string;
  reviewsInDb: number;
  lastPageToken?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GoogleBusinessReviewSyncDiffItem {
  googleReviewId: string;
  starRatingNumeric: number;
  reviewerDisplayName: string;
  comment?: string | undefined;
  updateTime: Date;
  isNew: boolean;
}

export interface GoogleBusinessReviewSyncResult {
  locationId: string;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  diff: GoogleBusinessReviewSyncDiffItem[];
  errors: string[];
}

export type GoogleBusinessReviewPeriod =
  | "today"
  | "weekToDate"
  | "month"
  | "custom"
  | "all";

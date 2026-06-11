import mongoose, { Schema, Document, Types } from "mongoose";
import { GOOGLE_STAR_RATINGS } from "../types/googleBusinessReview.types.js";

export interface GoogleBusinessReviewDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  googleReviewId: string;
  googleReviewName: string;
  starRating: (typeof GOOGLE_STAR_RATINGS)[number];
  starRatingNumeric: number;
  comment?: string;
  reviewer: {
    displayName: string;
    profilePhotoUrl: string;
  };
  createTime: Date;
  updateTime: Date;
  reviewReply?: {
    comment: string;
    updateTime: Date;
  };
  firstSyncedAt: Date;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reviewerSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    profilePhotoUrl: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const reviewReplySchema = new Schema(
  {
    comment: { type: String, required: true },
    updateTime: { type: Date, required: true },
  },
  { _id: false },
);

const googleBusinessReviewSchema = new Schema<GoogleBusinessReviewDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    googleReviewId: { type: String, required: true, trim: true },
    googleReviewName: { type: String, required: true, trim: true },
    starRating: { type: String, required: true, enum: GOOGLE_STAR_RATINGS },
    starRatingNumeric: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: false },
    reviewer: { type: reviewerSchema, required: true },
    createTime: { type: Date, required: true },
    updateTime: { type: Date, required: true },
    reviewReply: { type: reviewReplySchema, required: false },
    firstSyncedAt: { type: Date, required: true },
    lastSyncedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

googleBusinessReviewSchema.index({ locationId: 1, googleReviewId: 1 }, { unique: true });
googleBusinessReviewSchema.index({ locationId: 1, createTime: -1 });
googleBusinessReviewSchema.index({ locationId: 1, updateTime: -1 });
googleBusinessReviewSchema.index({ locationId: 1, starRatingNumeric: 1 });

export const GoogleBusinessReviewModel = mongoose.model<GoogleBusinessReviewDocument>(
  "GoogleBusinessReview",
  googleBusinessReviewSchema,
);

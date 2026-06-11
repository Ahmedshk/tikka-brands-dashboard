import mongoose, { Schema, Document, Types } from "mongoose";

export interface GoogleBusinessLocationSyncStateDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  googleAccountId: string;
  googleLocationId: string;
  googleTotalReviewCount: number;
  googleAverageRating: number;
  lastSyncStartedAt?: Date;
  lastSyncCompletedAt?: Date;
  lastSyncStatus: "idle" | "running" | "success" | "error";
  lastSyncError?: string;
  reviewsInDb: number;
  lastPageToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const googleBusinessLocationSyncStateSchema =
  new Schema<GoogleBusinessLocationSyncStateDocument>(
    {
      locationId: {
        type: Schema.Types.ObjectId,
        ref: "Location",
        required: true,
        unique: true,
      },
      googleAccountId: { type: String, required: true, trim: true },
      googleLocationId: { type: String, required: true, trim: true },
      googleTotalReviewCount: { type: Number, required: true, default: 0 },
      googleAverageRating: { type: Number, required: true, default: 0 },
      lastSyncStartedAt: { type: Date, required: false },
      lastSyncCompletedAt: { type: Date, required: false },
      lastSyncStatus: {
        type: String,
        enum: ["idle", "running", "success", "error"],
        default: "idle",
      },
      lastSyncError: { type: String, required: false },
      reviewsInDb: { type: Number, required: true, default: 0 },
      lastPageToken: { type: String, required: false },
    },
    { timestamps: true },
  );

export const GoogleBusinessLocationSyncStateModel =
  mongoose.model<GoogleBusinessLocationSyncStateDocument>(
    "GoogleBusinessLocationSyncState",
    googleBusinessLocationSyncStateSchema,
  );

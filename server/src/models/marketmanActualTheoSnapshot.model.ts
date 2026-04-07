import mongoose, { Schema, Document, Types } from "mongoose";

export interface MarketManActualTheoSnapshotDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  buyerGuid: string;
  /** Local calendar date yyyy-MM-dd in location timezone used for this sync */
  syncDateKey: string;
  /** Request params sent to MarketMan */
  startDateUTC: string;
  endDateUTC: string;
  raw: Record<string, unknown>;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MarketManActualTheoSnapshotDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    buyerGuid: { type: String, required: true, trim: true },
    syncDateKey: { type: String, required: true, trim: true },
    startDateUTC: { type: String, required: true },
    endDateUTC: { type: String, required: true },
    raw: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, buyerGuid: 1, syncDateKey: 1 },
  { unique: true },
);

schema.index({ buyerGuid: 1, startDateUTC: 1, endDateUTC: 1 });

export const MarketManActualTheoSnapshotModel =
  mongoose.model<MarketManActualTheoSnapshotDocument>(
    "MarketManActualTheoSnapshot",
    schema,
  );

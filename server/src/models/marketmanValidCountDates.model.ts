import mongoose, { Schema, Document, Types } from "mongoose";

export interface MarketManValidCountDatesDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  buyerGuid: string;
  startDates: string[];
  endDates: string[];
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const marketManValidCountDatesSchema = new Schema<MarketManValidCountDatesDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    buyerGuid: { type: String, required: true, trim: true },
    startDates: { type: [String], default: [] },
    endDates: { type: [String], default: [] },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

marketManValidCountDatesSchema.index({ locationId: 1, buyerGuid: 1 }, { unique: true });
marketManValidCountDatesSchema.index({ buyerGuid: 1, fetchedAt: -1 });

export const MarketManValidCountDatesModel = mongoose.model<MarketManValidCountDatesDocument>(
  "MarketManValidCountDates",
  marketManValidCountDatesSchema,
);

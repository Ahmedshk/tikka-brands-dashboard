import mongoose, { Schema, Document, Types } from "mongoose";
import type { MarketManOrderApiKind } from "./marketmanOrderCache.model.js";

export interface MarketManOrderDailyRollupDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  buyerGuid: string;
  apiKind: MarketManOrderApiKind;
  businessDateKey: string;
  computedAt: Date;
  orderCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MarketManOrderDailyRollupDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    buyerGuid: { type: String, required: true, trim: true },
    apiKind: { type: String, required: true, enum: ["sent", "delivery"] },
    businessDateKey: { type: String, required: true, trim: true },
    computedAt: { type: Date, required: true },
    orderCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, buyerGuid: 1, apiKind: 1, businessDateKey: 1 },
  { unique: true },
);

export const MarketManOrderDailyRollupModel = mongoose.model<MarketManOrderDailyRollupDocument>(
  "MarketManOrderDailyRollup",
  schema,
);

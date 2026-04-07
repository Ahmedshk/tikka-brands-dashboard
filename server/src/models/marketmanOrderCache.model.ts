import mongoose, { Schema, Document, Types } from "mongoose";

export type MarketManOrderApiKind = "sent" | "delivery";

export interface MarketManOrderCacheDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  buyerGuid: string;
  apiKind: MarketManOrderApiKind;
  orderNumber: string;
  raw: Record<string, unknown>;
  dateTimeFromUTC: string;
  dateTimeToUTC: string;
  fetchedAt: Date;
  /**
   * Denormalized business date for range reads: `DeliveryDateUTC` when apiKind is delivery,
   * `SentDateUTC` when apiKind is sent (not the sync window fields above).
   */
  businessDateAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MarketManOrderCacheDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    buyerGuid: { type: String, required: true, trim: true },
    apiKind: { type: String, required: true, enum: ["sent", "delivery"] },
    orderNumber: { type: String, required: true, trim: true },
    raw: { type: Schema.Types.Mixed, required: true },
    dateTimeFromUTC: { type: String, required: true },
    dateTimeToUTC: { type: String, required: true },
    fetchedAt: { type: Date, required: true },
    businessDateAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index(
  { buyerGuid: 1, apiKind: 1, orderNumber: 1 },
  { unique: true },
);
schema.index({ locationId: 1, fetchedAt: -1 });
schema.index({
  locationId: 1,
  buyerGuid: 1,
  apiKind: 1,
  businessDateAt: 1,
});

export const MarketManOrderCacheModel = mongoose.model<MarketManOrderCacheDocument>(
  "MarketManOrderCache",
  schema,
);

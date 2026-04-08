import mongoose, { Schema, Document, Types } from "mongoose";

export type SquareOrderPeriodGranularity = "week" | "month" | "year";

export interface SquareOrderPeriodRollupDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  granularity: SquareOrderPeriodGranularity;
  /** Week: Sunday yyyy-MM-dd in TZ; month: yyyy-MM; year: yyyy */
  periodKey: string;
  computedAt: Date;
  netSalesCents: number;
  transactionCount: number;
  totalDiscountCents: number;
  totalRefundCents: number;
  refundCount: number;
  sourcesOfSales: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<SquareOrderPeriodRollupDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    granularity: {
      type: String,
      required: true,
      enum: ["week", "month", "year"],
    },
    periodKey: { type: String, required: true, trim: true },
    computedAt: { type: Date, required: true },
    netSalesCents: { type: Number, required: true, default: 0 },
    transactionCount: { type: Number, required: true, default: 0 },
    totalDiscountCents: { type: Number, required: true, default: 0 },
    totalRefundCents: { type: Number, required: true, default: 0 },
    refundCount: { type: Number, required: true, default: 0 },
    sourcesOfSales: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, granularity: 1, periodKey: 1 },
  { unique: true },
);

export const SquareOrderPeriodRollupModel = mongoose.model<SquareOrderPeriodRollupDocument>(
  "SquareOrderPeriodRollup",
  schema,
);

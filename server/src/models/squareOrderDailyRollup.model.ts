import mongoose, { Schema, Document, Types } from "mongoose";
import type { CategoryRollupBreakdownRow } from "../utils/squareCategoryRollupBreakdown.util.js";

export interface SquareOrderDailyRollupDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  /** Calendar date key `yyyy-MM-dd` in the location's IANA timezone. */
  businessDateKey: string;
  computedAt: Date;
  netSalesCents: number;
  transactionCount: number;
  totalDiscountCents: number;
  totalRefundCents: number;
  refundCount: number;
  /** Same shape as `getSourcesOfSalesFromOrders` (optional materialization). */
  sourcesOfSales: unknown[];
  /** Net sales + txn counts by Square catalog CATEGORY id (see `squareCategoryRollupBreakdown.util`). */
  categoriesBreakdown?: CategoryRollupBreakdownRow[];
  createdAt: Date;
  updatedAt: Date;
}

const categoryBreakdownRowSchema = new Schema(
  {
    categoryId: { type: String, required: true, trim: true },
    netSalesCents: { type: Number, required: true, default: 0 },
    transactionCount: { type: Number, required: true, default: 0 },
    nameSnapshot: { type: String, trim: true },
  },
  { _id: false },
);

const schema = new Schema<SquareOrderDailyRollupDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    businessDateKey: { type: String, required: true, trim: true },
    computedAt: { type: Date, required: true },
    netSalesCents: { type: Number, required: true, default: 0 },
    transactionCount: { type: Number, required: true, default: 0 },
    totalDiscountCents: { type: Number, required: true, default: 0 },
    totalRefundCents: { type: Number, required: true, default: 0 },
    refundCount: { type: Number, required: true, default: 0 },
    sourcesOfSales: { type: [Schema.Types.Mixed], default: [] },
    categoriesBreakdown: {
      type: [categoryBreakdownRowSchema],
      default: [],
    },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, businessDateKey: 1 },
  { unique: true },
);

export const SquareOrderDailyRollupModel = mongoose.model<SquareOrderDailyRollupDocument>(
  "SquareOrderDailyRollup",
  schema,
);

import mongoose, { Schema, Document, Types } from "mongoose";

export interface SquareOrderHourlyRollupDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  /** Business date key (opening calendar date in location TZ). */
  businessDateKey: string;
  /** 0–23 business-hour slot from business start. */
  slotIndex: number;
  computedAt: Date;
  netSalesCents: number;
  transactionCount: number;
  /**
   * Summable facts per source id (rollup reads depend on `id` + `amount` only).
   * Preferred shape: Array<{ id: string; amount: string }>, where amount is a currency string.
   */
  sourcesOfSales: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<SquareOrderHourlyRollupDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    businessDateKey: { type: String, required: true, trim: true },
    slotIndex: { type: Number, required: true, min: 0, max: 23 },
    computedAt: { type: Date, required: true },
    netSalesCents: { type: Number, required: true, default: 0 },
    transactionCount: { type: Number, required: true, default: 0 },
    sourcesOfSales: { type: [Schema.Types.Mixed], required: true, default: [] },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, businessDateKey: 1, slotIndex: 1 },
  { unique: true },
);

export const SquareOrderHourlyRollupModel = mongoose.model<SquareOrderHourlyRollupDocument>(
  "SquareOrderHourlyRollup",
  schema,
);

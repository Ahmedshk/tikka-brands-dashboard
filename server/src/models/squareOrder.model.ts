import mongoose, { Schema, Document, Types } from "mongoose";

export interface SquareOrderDocument extends Document {
  _id: Types.ObjectId;
  /** Square order id */
  squareId: string;
  locationId: Types.ObjectId;
  /** Full Square order payload (Search API / webhook). Business times live here, e.g. `created_at`. */
  raw: Record<string, unknown>;
  /** Denormalized from `raw` for indexed range queries (Square business `created_at`). */
  squareCreatedAt: Date | null;
  /** Denormalized: true when order is canceled or payment-failure-only (excluded from dashboard metrics). */
  excludedFromDashboard: boolean;
  /**
   * Mongoose sync/import time when this row was upserted — not the Square order time.
   * For reporting and date filters, always use `raw.created_at` (see `getSquareOrderCreatedAtMsFromRaw`).
   */
  createdAt: Date;
  /** Last upsert of this document; not Square `updated_at`. */
  updatedAt: Date;
}

const squareOrderSchema = new Schema<SquareOrderDocument>(
  {
    squareId: { type: String, required: true, trim: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    raw: { type: Schema.Types.Mixed, required: true },
    squareCreatedAt: { type: Date, default: null },
    excludedFromDashboard: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

squareOrderSchema.index({ squareId: 1 }, { unique: true });
squareOrderSchema.index({ locationId: 1, updatedAt: -1 });
// Original composite index. Kept alongside the partial index below until
// the partial index has been verified in staging/prod; drop in a follow-up
// PR once the planner has been observed using the partial index.
squareOrderSchema.index({
  locationId: 1,
  excludedFromDashboard: 1,
  squareCreatedAt: 1,
});
// Partial index for the dashboard read path. The dashboard query always
// filters `excludedFromDashboard: false`; pushing that into the filter
// expression keeps the index smaller (no entries for excluded orders) and
// lets the planner range-scan (locationId, squareCreatedAt) directly without
// a useless middle equality.
squareOrderSchema.index(
  { locationId: 1, squareCreatedAt: 1 },
  { partialFilterExpression: { excludedFromDashboard: false } },
);

export const SquareOrderModel = mongoose.model<SquareOrderDocument>(
  "SquareOrder",
  squareOrderSchema,
);

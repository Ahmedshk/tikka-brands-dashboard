import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Pre-aggregated labor cost per business-hour slot (24 slots starting at the
 * location's business start time). Mirrors {@link SquareOrderHourlyRollupModel}
 * for the labor side so the Sales & Labor Detail hourly-breakdown card never
 * has to prorate raw timecards across 24 slots on the read path.
 *
 * Built by {@link buildHomebaseTimecardHourlyRollupsForDay} and rebuilt for
 * "today + yesterday" on every 15-min poll cycle (mirrors the Square
 * after-poll refresh). Historical days are populated by the backfill script
 * `rollup-homebase-timecards-hourly.ts`.
 */
export interface HomebaseTimecardHourlyRollupDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  /** Business date key (opening calendar date in location TZ). */
  businessDateKey: string;
  /** 0–23 business-hour slot from business start time. */
  slotIndex: number;
  computedAt: Date;
  /**
   * Labor cost contribution that overlaps this slot, prorated across the
   * timecard's clock-in → clock-out (or end-of-day for open timecards).
   * Stored in dollars (matches `timecard.labor.costs` units from Homebase API).
   */
  laborCost: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<HomebaseTimecardHourlyRollupDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    businessDateKey: { type: String, required: true, trim: true },
    slotIndex: { type: Number, required: true, min: 0, max: 23 },
    computedAt: { type: Date, required: true },
    laborCost: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, businessDateKey: 1, slotIndex: 1 },
  { unique: true },
);

export const HomebaseTimecardHourlyRollupModel = mongoose.model<HomebaseTimecardHourlyRollupDocument>(
  "HomebaseTimecardHourlyRollup",
  schema,
);

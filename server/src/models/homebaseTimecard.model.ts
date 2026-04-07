import mongoose, { Schema, Document, Types } from "mongoose";

export interface HomebaseTimecardDocument extends Document {
  _id: Types.ObjectId;
  /** Homebase timecard id */
  homebaseId: number;
  locationId: Types.ObjectId;
  raw: Record<string, unknown>;
  /** Denormalized from `raw.clock_in` for indexed range queries. */
  clockInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const homebaseTimecardSchema = new Schema<HomebaseTimecardDocument>(
  {
    homebaseId: { type: Number, required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    raw: { type: Schema.Types.Mixed, required: true },
    clockInAt: { type: Date, default: null },
  },
  { timestamps: true },
);

homebaseTimecardSchema.index({ homebaseId: 1, locationId: 1 }, { unique: true });
homebaseTimecardSchema.index({ locationId: 1, updatedAt: -1 });
homebaseTimecardSchema.index({ locationId: 1, clockInAt: 1 });

export const HomebaseTimecardModel = mongoose.model<HomebaseTimecardDocument>(
  "HomebaseTimecard",
  homebaseTimecardSchema,
);

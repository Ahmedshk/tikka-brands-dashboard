import mongoose, { Schema, Document, Types } from "mongoose";

export interface HomebaseTimecardDailyRollupDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  businessDateKey: string;
  computedAt: Date;
  totalLaborCost: number;
  totalPaidHours: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<HomebaseTimecardDailyRollupDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    businessDateKey: { type: String, required: true, trim: true },
    computedAt: { type: Date, required: true },
    totalLaborCost: { type: Number, required: true, default: 0 },
    totalPaidHours: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, businessDateKey: 1 },
  { unique: true },
);

export const HomebaseTimecardDailyRollupModel = mongoose.model<HomebaseTimecardDailyRollupDocument>(
  "HomebaseTimecardDailyRollup",
  schema,
);

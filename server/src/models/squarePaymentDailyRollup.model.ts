import mongoose, { Schema, Document, Types } from "mongoose";

export interface SquarePaymentDailyRollupDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  businessDateKey: string;
  computedAt: Date;
  paymentCount: number;
  totalAmountCents: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<SquarePaymentDailyRollupDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    businessDateKey: { type: String, required: true, trim: true },
    computedAt: { type: Date, required: true },
    paymentCount: { type: Number, required: true, default: 0 },
    totalAmountCents: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

schema.index(
  { locationId: 1, businessDateKey: 1 },
  { unique: true },
);

export const SquarePaymentDailyRollupModel = mongoose.model<SquarePaymentDailyRollupDocument>(
  "SquarePaymentDailyRollup",
  schema,
);

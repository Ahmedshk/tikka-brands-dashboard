import mongoose, { Schema, Document, Types } from "mongoose";

export interface SquarePaymentDocument extends Document {
  _id: Types.ObjectId;
  /** Square payment id */
  squareId: string;
  locationId: Types.ObjectId;
  raw: Record<string, unknown>;
  /** Denormalized from `raw.created_at` for indexed range queries. */
  paymentCreatedAt: Date | null;
  /** Denormalized from `raw.status`. */
  paymentStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const squarePaymentSchema = new Schema<SquarePaymentDocument>(
  {
    squareId: { type: String, required: true, trim: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    raw: { type: Schema.Types.Mixed, required: true },
    paymentCreatedAt: { type: Date, default: null },
    paymentStatus: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

squarePaymentSchema.index({ squareId: 1 }, { unique: true });
squarePaymentSchema.index({ locationId: 1, updatedAt: -1 });
squarePaymentSchema.index({
  locationId: 1,
  paymentCreatedAt: 1,
});

export const SquarePaymentModel = mongoose.model<SquarePaymentDocument>(
  "SquarePayment",
  squarePaymentSchema,
);

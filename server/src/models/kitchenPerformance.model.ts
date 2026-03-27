import mongoose, { Schema, Document, Types } from "mongoose";

export interface KitchenPerformanceRowSubdocument {
  deviceName: string;
  type?: string;
  completedTickets: number;
  avgCompletionTimeSeconds: number;
}

export interface KitchenPerformanceDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  reportDate: string;
  rows: KitchenPerformanceRowSubdocument[];
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const kitchenPerformanceRowSchema = new Schema<KitchenPerformanceRowSubdocument>(
  {
    deviceName: { type: String, required: true, trim: true },
    type: { type: String, required: false, trim: true, default: "Unknown" },
    completedTickets: { type: Number, required: true, min: 0, default: 0 },
    avgCompletionTimeSeconds: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const kitchenPerformanceSchema = new Schema<KitchenPerformanceDocument>(
  {
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    reportDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    rows: { type: [kitchenPerformanceRowSchema], default: [] },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

kitchenPerformanceSchema.index({ locationId: 1, reportDate: 1 }, { unique: true });

export const KitchenPerformanceModel = mongoose.model<KitchenPerformanceDocument>(
  "KitchenPerformance",
  kitchenPerformanceSchema,
);

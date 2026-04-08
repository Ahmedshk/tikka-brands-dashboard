import mongoose, { Schema, Document, Types } from "mongoose";

export interface AlertNotificationLogDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  alertKind: string;
  severity: "warning" | "critical";
  fireKey: string;
  createdAt: Date;
}

const alertNotificationLogSchema = new Schema<AlertNotificationLogDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    alertKind: { type: String, required: true },
    severity: { type: String, enum: ["warning", "critical"], required: true },
    fireKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

alertNotificationLogSchema.index(
  { locationId: 1, alertKind: 1, severity: 1, fireKey: 1 },
  { unique: true },
);

export const AlertNotificationLogModel = mongoose.model<AlertNotificationLogDocument>(
  "AlertNotificationLog",
  alertNotificationLogSchema,
);

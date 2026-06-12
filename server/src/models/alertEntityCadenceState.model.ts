import mongoose, { Schema, Document, Types } from "mongoose";

export type AlertEntityCadenceKind =
  | "delivery_overdue"
  | "training_overdue"
  | "pip_pending";

export interface AlertEntityCadenceStateDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  alertKind: AlertEntityCadenceKind;
  entityId: string;
  isActive: boolean;
  episodeStartedAt: Date;
  lastAlertedAt: Date | null;
  updatedAt: Date;
}

const alertEntityCadenceStateSchema = new Schema<AlertEntityCadenceStateDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    alertKind: {
      type: String,
      enum: ["delivery_overdue", "training_overdue", "pip_pending"],
      required: true,
    },
    entityId: { type: String, required: true, trim: true },
    isActive: { type: Boolean, required: true, default: false },
    episodeStartedAt: { type: Date, required: true, default: () => new Date() },
    lastAlertedAt: { type: Date, required: false, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

alertEntityCadenceStateSchema.index(
  { locationId: 1, alertKind: 1, entityId: 1 },
  { unique: true },
);

export const AlertEntityCadenceStateModel = mongoose.model<AlertEntityCadenceStateDocument>(
  "AlertEntityCadenceState",
  alertEntityCadenceStateSchema,
);

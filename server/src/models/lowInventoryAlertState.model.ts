import mongoose, { Schema, Document, Types } from "mongoose";

export interface LowInventoryAlertStateDocument extends Document {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  itemId: string;
  locationName: string | null;
  itemName: string | null;
  categoryName: string | null;
  uomName: string | null;
  isLow: boolean;
  lastOnHand: number | null;
  lastMinOnHand: number | null;
  episodeStartedAt: Date;
  lastAlertedAt: Date | null;
  updatedAt: Date;
}

const lowInventoryAlertStateSchema = new Schema<LowInventoryAlertStateDocument>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    itemId: { type: String, required: true, trim: true },
    locationName: { type: String, required: false, default: null, trim: true },
    itemName: { type: String, required: false, default: null, trim: true },
    categoryName: { type: String, required: false, default: null, trim: true },
    uomName: { type: String, required: false, default: null, trim: true },
    isLow: { type: Boolean, required: true, default: false },
    lastOnHand: { type: Number, required: false, default: null },
    lastMinOnHand: { type: Number, required: false, default: null },
    episodeStartedAt: { type: Date, required: true, default: () => new Date() },
    lastAlertedAt: { type: Date, required: false, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

lowInventoryAlertStateSchema.index({ locationId: 1, itemId: 1 }, { unique: true });

export const LowInventoryAlertStateModel = mongoose.model<LowInventoryAlertStateDocument>(
  "LowInventoryAlertState",
  lowInventoryAlertStateSchema,
);


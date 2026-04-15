import mongoose, { Schema, Document, Types } from "mongoose";

export interface IntegratedGoogleCalendarDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  googleCalendarId: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const integratedGoogleCalendarSchema = new Schema<IntegratedGoogleCalendarDocument>(
  {
    name: { type: String, required: true, trim: true },
    googleCalendarId: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

export const IntegratedGoogleCalendarModel = mongoose.model<IntegratedGoogleCalendarDocument>(
  "IntegratedGoogleCalendar",
  integratedGoogleCalendarSchema,
);

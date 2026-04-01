import mongoose, { Schema, Document, Types } from "mongoose";

export interface CalendarNotificationLogDocument extends Document {
  _id: Types.ObjectId;
  calendarEventId: Types.ObjectId;
  userId: Types.ObjectId;
  kind: "reminder" | "start" | "hour_before";
  fireKey: string;
  createdAt: Date;
}

const calendarNotificationLogSchema = new Schema<CalendarNotificationLogDocument>(
  {
    calendarEventId: {
      type: Schema.Types.ObjectId,
      ref: "CalendarEvent",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["reminder", "start", "hour_before"], required: true },
    fireKey: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

calendarNotificationLogSchema.index(
  { calendarEventId: 1, userId: 1, kind: 1, fireKey: 1 },
  { unique: true },
);

export const CalendarNotificationLogModel = mongoose.model<CalendarNotificationLogDocument>(
  "CalendarNotificationLog",
  calendarNotificationLogSchema,
);

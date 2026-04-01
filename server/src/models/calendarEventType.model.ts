import mongoose, { Schema, Document, Types } from "mongoose";
import type { ICalendarReminderPolicy } from "../types/calendar.types.js";

export interface CalendarEventTypeDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  colorHex: string;
  sortOrder: number;
  isActive: boolean;
  reminderPolicy?: ICalendarReminderPolicy;
  createdAt: Date;
  updatedAt: Date;
}

const reminderPolicySubSchema = new Schema<ICalendarReminderPolicy>(
  {
    mode: { type: String, enum: ["daily_until", "single"], required: true, default: "daily_until" },
    daysBeforeStart: { type: Number, required: true, default: 3, min: 0, max: 365 },
    reminderTimeLocal: { type: String, required: true, default: "09:00", trim: true },
  },
  { _id: false },
);

const calendarEventTypeSchema = new Schema<CalendarEventTypeDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    colorHex: { type: String, required: true, default: "#6B7280", trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    reminderPolicy: { type: reminderPolicySubSchema, required: false },
  },
  { timestamps: true },
);

calendarEventTypeSchema.index({ isActive: 1, sortOrder: 1 });

export const CalendarEventTypeModel = mongoose.model<CalendarEventTypeDocument>(
  "CalendarEventType",
  calendarEventTypeSchema,
);

import mongoose, { Schema, Document, Types } from "mongoose";
import type {
  ICalendarReminderPolicy,
  ICalendarRoleEventBinding,
} from "../types/calendar.types.js";

export interface CalendarNotificationSettingsDocument extends Document {
  _id: Types.ObjectId;
  reminderPolicy: ICalendarReminderPolicy;
  roleEventBindings: ICalendarRoleEventBinding[];
  createdAt: Date;
  updatedAt: Date;
}

const reminderPolicySchema = new Schema<ICalendarReminderPolicy>(
  {
    mode: { type: String, enum: ["daily_until", "single"], required: true },
    daysBeforeStart: { type: Number, required: true, min: 0, max: 365 },
    reminderTimeLocal: { type: String, required: true, default: "09:00", trim: true },
  },
  { _id: false },
);

const channelPrefsSchema = new Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
  },
  { _id: false },
);

const roleEventBindingSchema = new Schema(
  {
    eventTypeId: { type: Schema.Types.ObjectId, ref: "CalendarEventType", required: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    channels: { type: channelPrefsSchema, required: true },
    notifyOnStart: { type: Boolean, default: true },
    notifyReminders: { type: Boolean, default: true },
  },
  { _id: false },
);

const calendarNotificationSettingsSchema = new Schema<CalendarNotificationSettingsDocument>(
  {
    reminderPolicy: { type: reminderPolicySchema, required: true },
    roleEventBindings: { type: [roleEventBindingSchema], default: [] },
  },
  { timestamps: true },
);

export const CalendarNotificationSettingsModel =
  mongoose.model<CalendarNotificationSettingsDocument>(
    "CalendarNotificationSettings",
    calendarNotificationSettingsSchema,
  );

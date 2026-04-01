import type { Types } from "mongoose";

export type CalendarReminderMode = "daily_until" | "single";

export interface ICalendarReminderPolicy {
  mode: CalendarReminderMode;
  /** Number of calendar days before event start to begin reminders (e.g. 3 = from 3 days before through start for daily_until). */
  daysBeforeStart: number;
  /** Local time HH:mm (24h) in the event location timezone for reminder sends. */
  reminderTimeLocal: string;
}

/** Default reminder policy for event types and legacy notification settings. */
export const DEFAULT_CALENDAR_REMINDER_POLICY: ICalendarReminderPolicy = {
  mode: "daily_until",
  daysBeforeStart: 3,
  reminderTimeLocal: "09:00",
};

export interface ICalendarRoleEventChannelPrefs {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export interface ICalendarRoleEventBinding {
  eventTypeId: Types.ObjectId | string;
  roleId: Types.ObjectId | string;
  channels: ICalendarRoleEventChannelPrefs;
  notifyOnStart: boolean;
  notifyReminders: boolean;
}

export interface ICalendarNotificationSettings {
  _id?: string;
  reminderPolicy: ICalendarReminderPolicy;
  roleEventBindings: ICalendarRoleEventBinding[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICalendarEventType {
  _id?: string;
  name: string;
  slug: string;
  colorHex: string;
  sortOrder: number;
  isActive: boolean;
  reminderPolicy: ICalendarReminderPolicy;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICalendarEvent {
  _id?: string;
  googleEventId: string;
  locationId: Types.ObjectId | string;
  eventTypeId: Types.ObjectId | string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;
  createdBy?: Types.ObjectId | string;
  lastSyncedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

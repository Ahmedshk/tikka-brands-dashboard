export interface CalendarReminderPolicyDto {
  mode: "daily_until" | "single";
  daysBeforeStart: number;
  reminderTimeLocal: string;
}

export const DEFAULT_CALENDAR_REMINDER_POLICY: CalendarReminderPolicyDto = {
  mode: "daily_until",
  daysBeforeStart: 3,
  reminderTimeLocal: "09:00",
};

export interface CalendarEventTypeDto {
  _id: string;
  name: string;
  slug: string;
  colorHex: string;
  sortOrder: number;
  isActive: boolean;
  reminderPolicy: CalendarReminderPolicyDto;
}

export interface CalendarEventDto {
  _id: string;
  googleCalendarId: string;
  googleEventId: string;
  locationId: string;
  eventTypeId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  timeZone: string;
  createdBy?: string;
  lastSyncedAt?: string;
  /** Present when events are listed for all locations. */
  locationName?: string;
}

export interface CalendarRoleEventBindingDto {
  eventTypeId: string;
  roleId: string;
  channels: { inApp: boolean; email: boolean; sms: boolean };
  notifyOnStart: boolean;
  notifyReminders: boolean;
}

export interface CalendarNotificationSettingsDto {
  _id?: string;
  reminderPolicy: CalendarReminderPolicyDto;
  roleEventBindings: CalendarRoleEventBindingDto[];
}

export interface IntegratedGoogleCalendarDto {
  _id: string;
  name: string;
  googleCalendarId: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

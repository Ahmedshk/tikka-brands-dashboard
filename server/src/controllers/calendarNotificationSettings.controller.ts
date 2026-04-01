import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CalendarNotificationSettingsService } from "../services/calendarNotificationSettings.service.js";
import type { ICalendarRoleEventBinding } from "../types/calendar.types.js";
import { normalizeRoleBindingChannels } from "../utils/calendarRoleBindingChannels.util.js";

const service = new CalendarNotificationSettingsService();

export async function getCalendarNotificationSettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await service.get();
    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
}

export async function updateCalendarNotificationSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as {
      reminderPolicy?: {
        mode: "daily_until" | "single";
        daysBeforeStart: number;
        reminderTimeLocal: string;
      };
      roleEventBindings?: Array<{
        eventTypeId: string;
        roleId: string;
        channels: { inApp: boolean; email: boolean; sms: boolean };
        notifyOnStart: boolean;
        notifyReminders: boolean;
      }>;
    };
    const upsertPayload: {
      reminderPolicy?: typeof body.reminderPolicy;
      roleEventBindings?: ICalendarRoleEventBinding[];
    } = {};
    if (body.reminderPolicy) upsertPayload.reminderPolicy = body.reminderPolicy;
    if (body.roleEventBindings !== undefined) {
      upsertPayload.roleEventBindings = body.roleEventBindings.map((b) => ({
        eventTypeId: new mongoose.Types.ObjectId(b.eventTypeId),
        roleId: new mongoose.Types.ObjectId(b.roleId),
        channels: normalizeRoleBindingChannels(b.channels),
        notifyOnStart: b.notifyOnStart,
        notifyReminders: b.notifyReminders,
      }));
    }
    const settings = await service.upsert(upsertPayload);
    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
}

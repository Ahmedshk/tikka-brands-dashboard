import { CalendarNotificationSettingsModel } from "../models/calendarNotificationSettings.model.js";
import { CALENDAR_RESCHEDULE_BY_SETTINGS_JOB } from "../constants/calendarAgendaJobs.js";
import {
  DEFAULT_CALENDAR_REMINDER_POLICY,
  type ICalendarNotificationSettings,
  type ICalendarReminderPolicy,
  type ICalendarRoleEventBinding,
} from "../types/calendar.types.js";
import { mergeReminderPolicy } from "../utils/calendarReminderPolicy.util.js";
import { normalizeRoleBindingChannels } from "../utils/calendarRoleBindingChannels.util.js";
import { logger } from "../utils/logger.util.js";

function toPlain(doc: {
  _id: { toString: () => string };
  reminderPolicy: ICalendarReminderPolicy;
  roleEventBindings: ICalendarRoleEventBinding[];
  createdAt?: Date;
  updatedAt?: Date;
}): ICalendarNotificationSettings {
  const out: ICalendarNotificationSettings = {
    _id: doc._id.toString(),
    reminderPolicy: mergeReminderPolicy(doc.reminderPolicy as Partial<ICalendarReminderPolicy>),
    roleEventBindings: (doc.roleEventBindings ?? []).map((b) => ({
      eventTypeId: typeof b.eventTypeId === "object" && b.eventTypeId && "toString" in b.eventTypeId
        ? (b.eventTypeId as { toString: () => string }).toString()
        : String(b.eventTypeId),
      roleId: typeof b.roleId === "object" && b.roleId && "toString" in b.roleId
        ? (b.roleId as { toString: () => string }).toString()
        : String(b.roleId),
      channels: normalizeRoleBindingChannels(b.channels),
      notifyOnStart: b.notifyOnStart,
      notifyReminders: b.notifyReminders,
    })),
  };
  if (doc.createdAt) out.createdAt = doc.createdAt;
  if (doc.updatedAt) out.updatedAt = doc.updatedAt;
  return out;
}

function eventTypeIdsFromBindings(bindings: ICalendarRoleEventBinding[]): string[] {
  const ids = bindings.map((b) =>
    typeof b.eventTypeId === "object" && b.eventTypeId && "toString" in b.eventTypeId
      ? (b.eventTypeId as { toString: () => string }).toString()
      : String(b.eventTypeId),
  );
  return [...new Set(ids)];
}

async function queueRescheduleBySettings(eventTypeIds: string[]): Promise<void> {
  if (eventTypeIds.length === 0) return;
  try {
    const { getAgenda } = await import("../config/agenda.js");
    await getAgenda().now(CALENDAR_RESCHEDULE_BY_SETTINGS_JOB, { eventTypeIds });
  } catch (e) {
    logger.warn("Could not queue calendar:reschedule-by-settings", { e, eventTypeIds });
  }
}

export class CalendarNotificationSettingsService {
  async get(): Promise<ICalendarNotificationSettings> {
    let doc = await CalendarNotificationSettingsModel.findOne();
    if (!doc) {
      doc = await CalendarNotificationSettingsModel.create({
        reminderPolicy: DEFAULT_CALENDAR_REMINDER_POLICY,
        roleEventBindings: [],
      });
    }
    return toPlain(doc);
  }

  async upsert(data: {
    reminderPolicy?: ICalendarReminderPolicy;
    roleEventBindings?: ICalendarRoleEventBinding[];
  }): Promise<ICalendarNotificationSettings> {
    let doc = await CalendarNotificationSettingsModel.findOne();
    if (!doc) {
      doc = await CalendarNotificationSettingsModel.create({
        reminderPolicy: data.reminderPolicy ?? DEFAULT_CALENDAR_REMINDER_POLICY,
        roleEventBindings: data.roleEventBindings ?? [],
      });
      const plain = toPlain(doc);
      await queueRescheduleBySettings(eventTypeIdsFromBindings(doc.roleEventBindings ?? []));
      return plain;
    }
    const typeIdsBefore = eventTypeIdsFromBindings(doc.roleEventBindings ?? []);
    if (data.reminderPolicy) doc.reminderPolicy = data.reminderPolicy;
    if (data.roleEventBindings) doc.roleEventBindings = data.roleEventBindings as never;
    await doc.save();
    const plain = toPlain(doc);
    const typeIdsAfter = eventTypeIdsFromBindings(doc.roleEventBindings ?? []);
    await queueRescheduleBySettings([...new Set([...typeIdsBefore, ...typeIdsAfter])]);
    return plain;
  }

  /** Raw document for jobs (lean). */
  async getRaw(): Promise<ICalendarNotificationSettings | null> {
    const doc = await CalendarNotificationSettingsModel.findOne().lean();
    if (!doc) return null;
    return toPlain(doc as never);
  }
}

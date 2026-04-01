import type { ICalendarReminderPolicy } from "../types/calendar.types.js";
import { DEFAULT_CALENDAR_REMINDER_POLICY } from "../types/calendar.types.js";

/** Merge stored subdocument with defaults (legacy docs may omit fields). */
export function mergeReminderPolicy(
  stored?: Partial<ICalendarReminderPolicy> | null,
): ICalendarReminderPolicy {
  const d = DEFAULT_CALENDAR_REMINDER_POLICY;
  if (!stored) return { ...d };
  const mode =
    stored.mode === "daily_until" || stored.mode === "single" ? stored.mode : d.mode;
  const daysBeforeStart =
    typeof stored.daysBeforeStart === "number" &&
    stored.daysBeforeStart >= 0 &&
    stored.daysBeforeStart <= 365
      ? stored.daysBeforeStart
      : d.daysBeforeStart;
  const reminderTimeLocal =
    typeof stored.reminderTimeLocal === "string" &&
    /^\d{1,2}:\d{2}$/.test(stored.reminderTimeLocal)
      ? stored.reminderTimeLocal
      : d.reminderTimeLocal;
  return { mode, daysBeforeStart, reminderTimeLocal };
}

export function applyReminderPolicyPatch(
  base: ICalendarReminderPolicy,
  patch: Partial<ICalendarReminderPolicy>,
): ICalendarReminderPolicy {
  const next = {
    mode: patch.mode ?? base.mode,
    daysBeforeStart: patch.daysBeforeStart ?? base.daysBeforeStart,
    reminderTimeLocal: patch.reminderTimeLocal ?? base.reminderTimeLocal,
  };
  return mergeReminderPolicy(next);
}

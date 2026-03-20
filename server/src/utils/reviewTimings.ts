import { addDays, addMinutes, differenceInDays, differenceInMinutes } from "date-fns";

export const isTestMode = (): boolean => process.env.REVIEW_TEST_MODE === "true";

/** Minutes from now for dueDate90 when creating a cycle in test mode (must match reviewCycle.service). */
export const TEST_MODE_DUE_MINUTES_FROM_NOW = 10;
/** Minutes from cycle creation until notifyDate75 in test mode (was 5). */
export const TEST_MODE_NOTIFY_MINUTES_FROM_START = 1;

export const CYCLE_LENGTH = 90;
export const NOTIFY_BEFORE_DUE = -15;
/**
 * Days before dueDate90 for the 75-day-style notification (prod).
 * In test mode: minutes before due such that notify fires TEST_MODE_NOTIFY_MINUTES_FROM_START after creation.
 */
export const getNotifyBeforeDue = (): number =>
  isTestMode()
    ? -(TEST_MODE_DUE_MINUTES_FROM_NOW - TEST_MODE_NOTIFY_MINUTES_FROM_START)
    : NOTIFY_BEFORE_DUE;
export const FORM_BEFORE_DUE = -5;
export const LATE_AFTER_DUE = 1;
export const PAST_DUE_AFTER_DUE = 2;
export const MANAGER_DEADLINE = 5;
export const DIRECTOR_DEADLINE = 3;
export const SHARING_DEADLINE = 3;
export const CHECKIN_30 = 30;
export const CHECKIN_30_PAST_DUE = 35;
export const CHECKIN_60 = 60;
export const CHECKIN_60_PAST_DUE = 65;
/** In test mode: 1 minute after final review complete; otherwise CHECKIN_30 (days). */
export const getCheckin30 = (): number => (isTestMode() ? 1 : CHECKIN_30);
/** In test mode: 2 minutes (1 min grace after 30-day due); otherwise CHECKIN_30_PAST_DUE. */
export const getCheckin30PastDue = (): number => (isTestMode() ? 2 : CHECKIN_30_PAST_DUE);
/** In test mode: 1 minute after final review complete (same origin as prod: completedAt); otherwise CHECKIN_60 (days). */
export const getCheckin60 = (): number => (isTestMode() ? 1 : CHECKIN_60);
/** In test mode: 2 minutes (1 min grace after 60-day due); otherwise CHECKIN_60_PAST_DUE. */
export const getCheckin60PastDue = (): number => (isTestMode() ? 2 : CHECKIN_60_PAST_DUE);
export const NEXT_CYCLE_OFFSET = 90;

/**
 * Add a period to a date.
 * In production: 1 unit = 1 day.
 * In test mode:  1 unit = 1 minute.
 */
export function addPeriod(date: Date, units: number): Date {
  return isTestMode() ? addMinutes(date, units) : addDays(date, units);
}

/**
 * Difference between two dates in period units.
 * In production: returns difference in days.
 * In test mode:  returns difference in minutes.
 */
export function diffPeriod(laterDate: Date, earlierDate: Date): number {
  return isTestMode() ? differenceInMinutes(laterDate, earlierDate) : differenceInDays(laterDate, earlierDate);
}

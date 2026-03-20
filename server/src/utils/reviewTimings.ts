import { addDays, addMinutes, differenceInDays, differenceInMinutes } from "date-fns";

export const isTestMode = (): boolean => process.env.REVIEW_TEST_MODE === "true";

export const CYCLE_LENGTH = 90;
export const NOTIFY_BEFORE_DUE = -15;
/** In test mode: 5 minutes before due; otherwise NOTIFY_BEFORE_DUE (-15 days). */
export const getNotifyBeforeDue = (): number => (isTestMode() ? -5 : NOTIFY_BEFORE_DUE);
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
/** In test mode: 5 units (minutes); otherwise CHECKIN_30. */
export const getCheckin30 = (): number => (isTestMode() ? 5 : CHECKIN_30);
/** In test mode: 10 units (minutes); otherwise CHECKIN_30_PAST_DUE. */
export const getCheckin30PastDue = (): number => (isTestMode() ? 10 : CHECKIN_30_PAST_DUE);
/** In test mode: 5 units (minutes); otherwise CHECKIN_60. */
export const getCheckin60 = (): number => (isTestMode() ? 5 : CHECKIN_60);
/** In test mode: 10 units (minutes); otherwise CHECKIN_60_PAST_DUE. */
export const getCheckin60PastDue = (): number => (isTestMode() ? 10 : CHECKIN_60_PAST_DUE);
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

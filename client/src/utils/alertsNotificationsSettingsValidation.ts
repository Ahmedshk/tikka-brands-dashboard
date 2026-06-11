import type { AlertNotificationSettingsDto } from "../types/alertNotification.types";

/** Returns an error message when low-rating alert schedule is invalid; otherwise null. */
export function validateLowRatingReviewsSchedule(
  settings: AlertNotificationSettingsDto,
): string | null {
  const rep = settings.reputationHr;
  if (!rep.lowRatingReviews) {
    return null;
  }

  const run = rep.lowRatingReviewsRun;
  if (run.scheduleMode !== "interval") {
    return null;
  }

  if (run.interval.hours < 1) {
    return "Low Google review rating alert: interval hours must be at least 1.";
  }

  return null;
}

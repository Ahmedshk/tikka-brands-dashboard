import { getCachedDateTimeFormatter } from "./timezone.util.js";

export const DEFAULT_LOW_RATING_REVIEW_LOCATION_TIMEZONE = "America/Denver";

export function formatLowRatingReviewUpdatedAtForEmail(
  updateTime: string | Date,
  timeZone: string | undefined,
): string {
  const d = updateTime instanceof Date ? updateTime : new Date(updateTime);
  if (Number.isNaN(d.getTime())) {
    return String(updateTime);
  }
  const tz = timeZone?.trim() || DEFAULT_LOW_RATING_REVIEW_LOCATION_TIMEZONE;
  return getCachedDateTimeFormatter("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  }).format(d);
}

export function quoteReviewCommentForNotification(comment: string | undefined): string {
  const text = comment?.trim() || "No comment";
  const safe = text.replaceAll('"', "'");
  return `"${safe}"`;
}

export function buildLowRatingReviewAlertLead(
  reviewerDisplayName: string,
  starRatingNumeric: number,
  threshold: number,
): string {
  return `${reviewerDisplayName} left a ${starRatingNumeric}-star review (below ${threshold} stars).`;
}

export function buildLowRatingReviewNotificationBody(params: {
  reviewerDisplayName: string;
  starRatingNumeric: number;
  threshold: number;
  comment?: string;
}): string {
  const lead = buildLowRatingReviewAlertLead(
    params.reviewerDisplayName,
    params.starRatingNumeric,
    params.threshold,
  );
  return `${lead} ${quoteReviewCommentForNotification(params.comment)}`;
}

/** In-app / command center message (location prefix supports all-locations grouping). */
export function buildLowRatingReviewInAppMessage(params: {
  storeName: string;
  reviewerDisplayName: string;
  starRatingNumeric: number;
  threshold: number;
  comment?: string;
}): string {
  return `${params.storeName}: ${buildLowRatingReviewNotificationBody(params)}`;
}

/** SMS body — same text as in-app; location append helper skips when store is already present. */
export function buildLowRatingReviewSmsMessage(params: {
  storeName: string;
  reviewerDisplayName: string;
  starRatingNumeric: number;
  threshold: number;
  comment?: string;
}): string {
  return buildLowRatingReviewInAppMessage(params);
}

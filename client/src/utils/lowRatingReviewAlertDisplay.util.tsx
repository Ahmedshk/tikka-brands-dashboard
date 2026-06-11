import type { ReactNode } from "react";

const LOW_RATING_REVIEW_BODY_RE =
  /^(.+? left a \d+-star review \(below \d+ stars\)\.)\s*"([^"]*)"$/;

const LOW_RATING_REVIEW_WITH_LOCATION_PREFIX_RE =
  /^[^:]+:\s+(.+ left a \d+-star review \(below \d+ stars\)\.\s*"[^"]*")$/;

function lowRatingReviewBodyWithoutLocationPrefix(text: string): string {
  const trimmed = text.trim();
  const withPrefix = LOW_RATING_REVIEW_WITH_LOCATION_PREFIX_RE.exec(trimmed);
  return withPrefix?.[1] ?? trimmed;
}

/** Renders low-rating alert body with the customer review in italics and quotes. */
export function renderLowRatingReviewAlertBody(text: string): ReactNode {
  const trimmed = lowRatingReviewBodyWithoutLocationPrefix(text);
  const match = LOW_RATING_REVIEW_BODY_RE.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const [, lead, quotedComment] = match;
  return (
    <>
      {lead}{" "}
      <em>
        &ldquo;{quotedComment}&rdquo;
      </em>
    </>
  );
}

export function isLowRatingReviewAlertType(type: string | undefined): boolean {
  return type === "alert_low_rating_review";
}

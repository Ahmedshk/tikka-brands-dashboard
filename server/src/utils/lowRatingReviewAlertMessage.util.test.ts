import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLowRatingReviewInAppMessage,
  buildLowRatingReviewNotificationBody,
  formatLowRatingReviewUpdatedAtForEmail,
  quoteReviewCommentForNotification,
} from "./lowRatingReviewAlertMessage.util.js";

test("quoteReviewCommentForNotification wraps comment in quotes", () => {
  assert.equal(
    quoteReviewCommentForNotification("Order was missing items."),
    '"Order was missing items."',
  );
});

test("quoteReviewCommentForNotification escapes inner double quotes", () => {
  assert.equal(quoteReviewCommentForNotification('Said "great" food'), '"Said \'great\' food"');
});

test("buildLowRatingReviewNotificationBody formats lead and quoted comment", () => {
  assert.equal(
    buildLowRatingReviewNotificationBody({
      reviewerDisplayName: "Alex Kim",
      starRatingNumeric: 2,
      threshold: 3,
      comment: "Order was missing items.",
    }),
    'Alex Kim left a 2-star review (below 3 stars). "Order was missing items."',
  );
});

test("formatLowRatingReviewUpdatedAtForEmail uses location timezone", () => {
  const formatted = formatLowRatingReviewUpdatedAtForEmail(
    "2026-06-11T12:20:00.000Z",
    "America/Denver",
  );
  assert.match(formatted, /Jun 11, 2026/);
  assert.match(formatted, /MDT|MST/);
});

test("buildLowRatingReviewInAppMessage prefixes store name", () => {
  assert.equal(
    buildLowRatingReviewInAppMessage({
      storeName: "Stackers Burger Co. 2 - 505 Central Ave NW",
      reviewerDisplayName: "Alex Kim",
      starRatingNumeric: 2,
      threshold: 3,
      comment: "Order was missing items.",
    }),
    'Stackers Burger Co. 2 - 505 Central Ave NW: Alex Kim left a 2-star review (below 3 stars). "Order was missing items."',
  );
});

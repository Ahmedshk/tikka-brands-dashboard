import test from "node:test";
import assert from "node:assert/strict";
import { computeWeightedReviewSummaryFromStates } from "./googleBusinessReviewAggregation.util.js";
import { isBelowLowRatingThreshold } from "./googleBusinessLowRatingAlert.util.js";

test("computeWeightedReviewSummaryFromStates uses review-count weighted average", () => {
  const summary = computeWeightedReviewSummaryFromStates([
    { googleTotalReviewCount: 10, googleAverageRating: 4.0 },
    { googleTotalReviewCount: 90, googleAverageRating: 5.0 },
  ]);

  assert.equal(summary.reviewCount, 100);
  assert.equal(summary.averageRating, 4.9);
});

test("computeWeightedReviewSummaryFromStates ignores zero-count locations", () => {
  const summary = computeWeightedReviewSummaryFromStates([
    { googleTotalReviewCount: 0, googleAverageRating: 1.0 },
    { googleTotalReviewCount: 5, googleAverageRating: 4.0 },
  ]);

  assert.equal(summary.reviewCount, 5);
  assert.equal(summary.averageRating, 4.0);
});

test("computeWeightedReviewSummaryFromStates returns null when no reviews", () => {
  const summary = computeWeightedReviewSummaryFromStates([]);
  assert.equal(summary.averageRating, null);
  assert.equal(summary.reviewCount, 0);
});

test("isBelowLowRatingThreshold alerts when rating is strictly below threshold", () => {
  assert.equal(isBelowLowRatingThreshold(2, 3), true);
  assert.equal(isBelowLowRatingThreshold(3, 3), false);
  assert.equal(isBelowLowRatingThreshold(4, 3), false);
  assert.equal(isBelowLowRatingThreshold(1, 5), true);
});

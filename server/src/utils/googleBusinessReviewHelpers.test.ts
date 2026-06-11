import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLowRatingReviewFireKey,
  buildReviewUpsertUpdate,
  hasReviewContentChanged,
  mapApiReviewToDocument,
  starRatingToNumeric,
} from "./googleBusinessReviewHelpers.js";
import type { GoogleBusinessApiReview } from "../types/googleBusinessReview.types.js";

const baseReview: GoogleBusinessApiReview = {
  reviewId: "rev-1",
  name: "accounts/1/locations/2/reviews/rev-1",
  starRating: "FOUR",
  createTime: "2024-01-15T10:00:00Z",
  updateTime: "2024-01-15T10:00:00Z",
  reviewer: {
    displayName: "Alex",
    profilePhotoUrl: "https://example.com/photo.jpg",
  },
};

test("starRatingToNumeric maps all enum values", () => {
  assert.equal(starRatingToNumeric("ONE"), 1);
  assert.equal(starRatingToNumeric("TWO"), 2);
  assert.equal(starRatingToNumeric("THREE"), 3);
  assert.equal(starRatingToNumeric("FOUR"), 4);
  assert.equal(starRatingToNumeric("FIVE"), 5);
});

test("mapApiReviewToDocument maps rating-only review without comment", () => {
  const syncedAt = new Date("2024-06-01T00:00:00Z");
  const doc = mapApiReviewToDocument(baseReview, "loc1", syncedAt);

  assert.equal(doc.googleReviewId, "rev-1");
  assert.equal(doc.googleReviewName, baseReview.name);
  assert.equal(doc.starRating, "FOUR");
  assert.equal(doc.starRatingNumeric, 4);
  assert.equal(doc.comment, undefined);
  assert.equal(doc.reviewer.displayName, "Alex");
  assert.equal(doc.createTime.toISOString(), "2024-01-15T10:00:00.000Z");
  assert.equal(doc.firstSyncedAt, syncedAt);
  assert.equal(doc.lastSyncedAt, syncedAt);
  assert.equal(doc.reviewReply, undefined);
});

test("mapApiReviewToDocument maps comment and business reply", () => {
  const syncedAt = new Date("2024-06-01T00:00:00Z");
  const withReply: GoogleBusinessApiReview = {
    ...baseReview,
    starRating: "TWO",
    comment: "Food was cold",
    reviewReply: {
      comment: "Sorry about that",
      updateTime: "2024-01-16T12:00:00Z",
    },
  };

  const doc = mapApiReviewToDocument(withReply, "loc1", syncedAt);
  assert.equal(doc.starRatingNumeric, 2);
  assert.equal(doc.comment, "Food was cold");
  assert.equal(doc.reviewReply?.comment, "Sorry about that");
  assert.equal(doc.reviewReply?.updateTime.toISOString(), "2024-01-16T12:00:00.000Z");
});

test("hasReviewContentChanged returns false when updateTime unchanged", () => {
  const existing = { updateTimeMs: new Date("2024-01-15T10:00:00Z").getTime() };
  assert.equal(hasReviewContentChanged(existing, baseReview), false);
});

test("hasReviewContentChanged returns true when updateTime changes", () => {
  const existing = { updateTimeMs: new Date("2024-01-14T10:00:00Z").getTime() };
  assert.equal(hasReviewContentChanged(existing, baseReview), true);
});

test("hasReviewContentChanged detects reply updateTime change", () => {
  const existing = {
    updateTimeMs: new Date("2024-01-15T10:00:00Z").getTime(),
    replyUpdateTimeMs: new Date("2024-01-16T11:00:00Z").getTime(),
  };
  const apiReview: GoogleBusinessApiReview = {
    ...baseReview,
    reviewReply: {
      comment: "Thanks",
      updateTime: "2024-01-16T12:00:00Z",
    },
  };
  assert.equal(hasReviewContentChanged(existing, apiReview), true);
});

test("buildReviewUpsertUpdate keeps firstSyncedAt only in $setOnInsert", () => {
  const syncedAt = new Date("2024-06-01T00:00:00Z");
  const mapped = mapApiReviewToDocument(baseReview, "loc1", syncedAt);
  const update = buildReviewUpsertUpdate(mapped, syncedAt);

  assert.equal("firstSyncedAt" in update.$set, false);
  assert.equal(update.$setOnInsert.firstSyncedAt, syncedAt);
  assert.equal(update.$set.lastSyncedAt, syncedAt);
  assert.equal(update.$set.googleReviewId, "rev-1");
});

test("buildLowRatingReviewFireKey is stable per review and updateTime", () => {
  const key = buildLowRatingReviewFireKey("rev-1", "2024-01-15T10:00:00Z");
  assert.equal(key, `low_rating_review_rev-1_${new Date("2024-01-15T10:00:00Z").getTime()}`);
});

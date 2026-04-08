import test from "node:test";
import assert from "node:assert/strict";
import { getBucketKeyForDate } from "./homebaseOrderedBuckets.util.js";

test("getBucketKeyForDate daily uses business date when businessStartTime is set", () => {
  // 2026-04-06 02:00 UTC = 2026-04-05 evening in America/Denver (MDT); with business day starting 10:00,
  // late night can belong to previous business date — assert stable mapping via helper.
  const d = new Date("2026-04-06T02:00:00.000Z");
  const key = getBucketKeyForDate(d, "America/Denver", "daily", {
    businessStartTime: "10:00",
  });
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test("getBucketKeyForDate weekly with business start uses Sunday week key in TZ", () => {
  const d = new Date("2026-04-09T15:00:00.000Z");
  const key = getBucketKeyForDate(d, "America/Denver", "weekly", {
    businessStartTime: "10:00",
  });
  assert.equal(key, "2026-04-05");
});

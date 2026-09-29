import test from "node:test";
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
import {
  businessDayUtcRangeIsoStrings,
  getBusinessHourIndexForBusinessDateKey,
  getPreviousBusinessDayRange,
} from "./businessDayUtcRange.util.js";

test("getBusinessHourIndexForBusinessDateKey: 23:30 local maps to slot 23 on a normal summer day", () => {
  const businessDateKey = "2025-07-15";
  const tz = "America/New_York";
  const order = fromZonedTime("2025-07-15T23:30:00", tz);
  const slot = getBusinessHourIndexForBusinessDateKey(
    order.toISOString(),
    tz,
    "00:00",
    businessDateKey,
  );
  assert.equal(slot, 23);
});

test("getBusinessHourIndexForBusinessDateKey: 23:30 local maps to slot 23 on spring-forward Sunday", () => {
  const businessDateKey = "2025-03-09";
  const tz = "America/New_York";
  const order = fromZonedTime("2025-03-09T23:30:00", tz);
  const slot = getBusinessHourIndexForBusinessDateKey(
    order.toISOString(),
    tz,
    "00:00",
    businessDateKey,
  );
  assert.equal(slot, 23);
});

test("getBusinessHourIndexForBusinessDateKey: late in last civil minute stays slot 23", () => {
  const businessDateKey = "2025-07-15";
  const tz = "America/New_York";
  const { endAt } = businessDayUtcRangeIsoStrings(tz, "00:00", businessDateKey);
  const endMs = new Date(endAt).getTime();
  const order = new Date(endMs - 50);
  const slot = getBusinessHourIndexForBusinessDateKey(
    order.toISOString(),
    tz,
    "00:00",
    businessDateKey,
  );
  assert.equal(slot, 23);
});

test("getBusinessHourIndexForBusinessDateKey: 10:00 business start — 23:00 wall same civil day is slot 13", () => {
  const businessDateKey = "2025-07-15";
  const tz = "America/New_York";
  const order = fromZonedTime("2025-07-15T23:00:00", tz);
  const slot = getBusinessHourIndexForBusinessDateKey(
    order.toISOString(),
    tz,
    "10:00",
    businessDateKey,
  );
  assert.equal(slot, 13);
});

test("getPreviousBusinessDayRange: mid-afternoon resolves to the prior calendar day's business window", () => {
  const tz = "America/New_York";
  const now = fromZonedTime("2025-07-16T16:00:00", tz);
  const prev = getPreviousBusinessDayRange(tz, "04:00", now);
  const expected = businessDayUtcRangeIsoStrings(tz, "04:00", "2025-07-15");
  assert.equal(prev.startAt, expected.startAt);
  assert.equal(prev.endAt, expected.endAt);
});

test("getPreviousBusinessDayRange: spans exactly one business day (04:00 → 03:59:59.999 next day)", () => {
  const tz = "America/New_York";
  const now = fromZonedTime("2025-07-16T16:00:00", tz);
  const { startAt, endAt } = getPreviousBusinessDayRange(tz, "04:00", now);
  assert.equal(startAt, fromZonedTime("2025-07-15T04:00:00", tz).toISOString());
  assert.equal(endAt, fromZonedTime("2025-07-16T03:59:59.999", tz).toISOString());
});

test("getPreviousBusinessDayRange: before business start, yesterday is the day before the current business day", () => {
  // 02:00 Wednesday is inside Tuesday's business day (04:00 Tue → 03:59:59 Wed),
  // so "yesterday" must be Monday, not the raw calendar day Tuesday.
  const tz = "America/New_York";
  const now = fromZonedTime("2025-07-16T02:00:00", tz);
  const expected = businessDayUtcRangeIsoStrings(tz, "04:00", "2025-07-14");
  const prev = getPreviousBusinessDayRange(tz, "04:00", now);
  assert.equal(prev.startAt, expected.startAt);
  assert.equal(prev.endAt, expected.endAt);
});

test("getPreviousBusinessDayRange: crossing a month boundary", () => {
  const tz = "America/New_York";
  const now = fromZonedTime("2025-08-01T16:00:00", tz);
  const expected = businessDayUtcRangeIsoStrings(tz, "04:00", "2025-07-31");
  const prev = getPreviousBusinessDayRange(tz, "04:00", now);
  assert.equal(prev.startAt, expected.startAt);
  assert.equal(prev.endAt, expected.endAt);
});

test("getPreviousBusinessDayRange: spring-forward previous day is a 23-hour window", () => {
  // 2025-03-09 02:00 local is the US spring-forward transition. A business day
  // opens at 04:00, so the short day is the one whose *opening* is 03-09; it is
  // "yesterday" whenever the current business day is 03-10.
  const tz = "America/New_York";
  const now = fromZonedTime("2025-03-10T16:00:00", tz);
  const prev = getPreviousBusinessDayRange(tz, "04:00", now);
  const expected = businessDayUtcRangeIsoStrings(tz, "04:00", "2025-03-09");
  assert.equal(prev.startAt, expected.startAt);
  assert.equal(prev.endAt, expected.endAt);
  const hours =
    (new Date(prev.endAt).getTime() - new Date(prev.startAt).getTime()) / 3_600_000;
  assert.equal(Math.round(hours), 23);
});

test("getPreviousBusinessDayRange: fall-back previous day is a 25-hour window", () => {
  // 2025-11-02 02:00 local is the US fall-back transition, so the long day is
  // the one whose opening is 11-02; it is "yesterday" when today is 11-03.
  const tz = "America/New_York";
  const now = fromZonedTime("2025-11-03T16:00:00", tz);
  const prev = getPreviousBusinessDayRange(tz, "04:00", now);
  const expected = businessDayUtcRangeIsoStrings(tz, "04:00", "2025-11-02");
  assert.equal(prev.startAt, expected.startAt);
  assert.equal(prev.endAt, expected.endAt);
  const hours =
    (new Date(prev.endAt).getTime() - new Date(prev.startAt).getTime()) / 3_600_000;
  assert.equal(Math.round(hours), 25);
});

test("getPreviousBusinessDayRange: exactly at business start the previous day is the prior business day", () => {
  const tz = "America/New_York";
  const now = fromZonedTime("2025-07-16T04:00:00", tz);
  const expected = businessDayUtcRangeIsoStrings(tz, "04:00", "2025-07-15");
  const prev = getPreviousBusinessDayRange(tz, "04:00", now);
  assert.equal(prev.startAt, expected.startAt);
  assert.equal(prev.endAt, expected.endAt);
});

test("getPreviousBusinessDayRange: midnight business start makes before-midnight roll back a day", () => {
  const tz = "America/New_York";
  // With a 00:00 business start, 23:30 Tuesday still belongs to Tuesday, so
  // yesterday is Monday.
  const now = fromZonedTime("2025-07-15T23:30:00", tz);
  const expected = businessDayUtcRangeIsoStrings(tz, "00:00", "2025-07-14");
  const prev = getPreviousBusinessDayRange(tz, "00:00", now);
  assert.equal(prev.startAt, expected.startAt);
  assert.equal(prev.endAt, expected.endAt);
});

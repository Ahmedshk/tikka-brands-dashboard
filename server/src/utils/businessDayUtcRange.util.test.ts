import test from "node:test";
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
import {
  businessDayUtcRangeIsoStrings,
  getBusinessHourIndexForBusinessDateKey,
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

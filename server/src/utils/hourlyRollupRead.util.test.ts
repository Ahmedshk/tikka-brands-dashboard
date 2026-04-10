import test from "node:test";
import assert from "node:assert/strict";
import { getBucketKeyForDate } from "./homebaseOrderedBuckets.util.js";
import {
  mapHourlyChartKeyToRollupSlot,
  parseHourlySalesTrendChartKey,
  wallClockHourStartUtc,
} from "./hourlyRollupRead.util.js";

test("parseHourlySalesTrendChartKey accepts yyyy-MM-ddTHH", () => {
  assert.deepStrictEqual(parseHourlySalesTrendChartKey("2026-03-15T14"), {
    y: 2026,
    m0: 2,
    d: 15,
    hour: 14,
  });
  assert.equal(parseHourlySalesTrendChartKey("bad"), null);
  assert.equal(parseHourlySalesTrendChartKey("2026-03-15"), null);
});

test("wallClockHourStartUtc yields instant in expected NY wall hour", () => {
  const d = wallClockHourStartUtc("2026-07-15T14", "America/New_York");
  assert.ok(d);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d!);
  const hour = parts.find((p) => p.type === "hour")?.value;
  assert.equal(hour, "14");
});

test("mapHourlyChartKeyToRollupSlot maps midnight business start to slot 14 for 2pm wall hour", () => {
  const m = mapHourlyChartKeyToRollupSlot(
    "2026-03-15T14",
    "America/New_York",
    "00:00",
  );
  assert.ok(m);
  assert.equal(m!.businessDateKey, "2026-03-15");
  assert.equal(m!.slotIndex, 14);
});

test("wallClockHourStartUtc T23 matches Intl wall hour in America/New_York (summer)", () => {
  const d = wallClockHourStartUtc("2026-07-15T23", "America/New_York");
  assert.ok(d);
  const key = getBucketKeyForDate(d!, "America/New_York", "hourly");
  assert.equal(key, "2026-07-15T23");
});

test("mapHourlyChartKeyToRollupSlot maps T23 to slot 23 when business starts at midnight", () => {
  const m = mapHourlyChartKeyToRollupSlot(
    "2026-07-15T23",
    "America/New_York",
    "00:00",
  );
  assert.ok(m);
  assert.equal(m!.businessDateKey, "2026-07-15");
  assert.equal(m!.slotIndex, 23);
});

test("mapHourlyChartKeyToRollupSlot spring-forward Sunday T23 maps to slot 23", () => {
  const m = mapHourlyChartKeyToRollupSlot(
    "2025-03-09T23",
    "America/New_York",
    "00:00",
  );
  assert.ok(m);
  assert.equal(m!.businessDateKey, "2025-03-09");
  assert.equal(m!.slotIndex, 23);
});

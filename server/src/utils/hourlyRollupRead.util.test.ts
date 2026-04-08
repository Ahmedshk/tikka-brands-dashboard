import test from "node:test";
import assert from "node:assert/strict";
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

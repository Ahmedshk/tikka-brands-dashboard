import test from "node:test";
import assert from "node:assert/strict";
import {
  sundayWeekStartYmdForBusinessDateKey,
  businessDateKeysForWeekPeriod,
} from "./rollupPeriodKeys.util.js";

test("sundayWeekStartYmdForBusinessDateKey walks back to Sunday in TZ", () => {
  const start = sundayWeekStartYmdForBusinessDateKey(
    "2026-04-09",
    "America/Denver",
  );
  assert.equal(start, "2026-04-05");
});

test("businessDateKeysForWeekPeriod returns seven days Sunday–Saturday", () => {
  const keys = businessDateKeysForWeekPeriod("2026-04-05", "America/Denver");
  assert.equal(keys.length, 7);
  assert.equal(keys[0], "2026-04-05");
  assert.equal(keys[6], "2026-04-11");
});

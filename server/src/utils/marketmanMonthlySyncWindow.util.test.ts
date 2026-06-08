import test from "node:test";
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
import {
  marketManMonthlySyncWindowDenver,
  MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ,
} from "./marketmanMonthlySyncWindow.util.js";

test("March 2026: start Jan 31, end Apr 1 (covers Feb 27)", () => {
  const ref = fromZonedTime("2026-03-15T10:00:00", MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ);
  const w = marketManMonthlySyncWindowDenver(ref);
  assert.equal(w.startDateKey, "2026-01-31");
  assert.equal(w.endDateKey, "2026-04-01");
  assert.equal(w.denverMonthKey, "2026-03");
  assert.equal(w.denverDateKey, "2026-03-15");

  const feb27 = fromZonedTime("2026-02-27T12:00:00", MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ);
  const start = new Date(w.startDateIso);
  const end = new Date(w.endDateIso);
  assert.ok(feb27.getTime() >= start.getTime());
  assert.ok(feb27.getTime() <= end.getTime());
});

test("January 2026: previous month Dec 2025, end Feb 1 2026", () => {
  const ref = fromZonedTime("2026-01-10T03:00:00", MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ);
  const w = marketManMonthlySyncWindowDenver(ref);
  assert.equal(w.startDateKey, "2025-11-30");
  assert.equal(w.endDateKey, "2026-02-01");
});

test("March 2024 leap year: Feb 29 inside window", () => {
  const ref = fromZonedTime("2024-03-05T03:00:00", MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ);
  const w = marketManMonthlySyncWindowDenver(ref);
  assert.equal(w.startDateKey, "2024-01-31");
  assert.equal(w.endDateKey, "2024-04-01");

  const feb29 = fromZonedTime("2024-02-29T12:00:00", MARKETMAN_SCHEDULED_ORDERS_SYNC_TZ);
  const start = new Date(w.startDateIso);
  const end = new Date(w.endDateIso);
  assert.ok(feb29.getTime() >= start.getTime());
  assert.ok(feb29.getTime() <= end.getTime());
});

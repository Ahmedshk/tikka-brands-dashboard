import test from "node:test";
import assert from "node:assert/strict";
import {
  getSalesTrendPeriodRange, getSalesTrendComparisonRange, getDatePartsInTz,
  getCalendarDayCountInRange, toLabelTimeRange, type PeriodType, type ComparisonType,
} from "./salesTrendDateRange.util.js";

const TZ = "America/New_York";
function dates(range: { startAt: string; endAt: string }) {
  const key = (iso: string) => {
    const { y, m, d } = getDatePartsInTz(new Date(iso), TZ);
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  return [key(range.startAt), key(range.endAt)];
}
function compare(periodType: PeriodType, comparisonType: ComparisonType) {
  const period = getSalesTrendPeriodRange(periodType, TZ, undefined, undefined, "04:00");
  const labels = toLabelTimeRange(period);
  const result = getSalesTrendComparisonRange(comparisonType, period.startAt, period.endAt, TZ, {
    periodType, businessStartTime: "04:00",
    periodDisplayStartAt: labels.startAt, periodDisplayEndAt: labels.endAt,
  });
  assert.ok(result);
  return result;
}

test("completed periods use full civil spans and location business boundaries", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-02T16:00:00Z") });
  const cases = [
    ["yesterday", "2026-10-01", "2026-10-01", "hourly"],
    ["lastWeek", "2026-09-20", "2026-09-26", "daily"],
    ["lastMonth", "2026-09-01", "2026-09-30", "daily"],
    ["lastYear", "2025-01-01", "2025-12-31", "monthly"],
  ] as const;
  for (const [type, start, end, granularity] of cases) {
    const range = getSalesTrendPeriodRange(type, TZ, undefined, undefined, "04:00");
    assert.deepEqual(dates(toLabelTimeRange(range)), [start, end]);
    assert.equal(range.granularity, granularity);
    assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(range.startAt)), "04");
  }
  assert.deepEqual(dates(compare("yesterday", "1DayPrior")), ["2026-09-30", "2026-10-01"]);
  assert.deepEqual(dates(toLabelTimeRange(compare("lastWeek", "samePeriodPreviousWeek"))), ["2026-09-13", "2026-09-19"]);
  assert.deepEqual(dates(toLabelTimeRange(compare("lastMonth", "samePeriodPreviousMonth"))), ["2026-08-01", "2026-08-31"]);
  assert.deepEqual(dates(toLabelTimeRange(compare("lastMonth", "priorYear"))), ["2025-09-01", "2025-09-30"]);
  assert.deepEqual(dates(toLabelTimeRange(compare("lastYear", "priorYear"))), ["2024-01-01", "2024-12-31"]);
  assert.deepEqual(dates(toLabelTimeRange(compare("lastYear", "year2Before"))), ["2023-01-01", "2023-12-31"]);
});

test("completed month handles leap years and January rollover", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2024-03-02T16:00:00Z") });
  assert.deepEqual(dates(toLabelTimeRange(getSalesTrendPeriodRange("lastMonth", TZ))), ["2024-02-01", "2024-02-29"]);
  assert.deepEqual(dates(toLabelTimeRange(compare("lastMonth", "priorYear"))), ["2023-02-01", "2023-02-28"]);
  t.mock.timers.setTime(new Date("2026-01-02T16:00:00Z").getTime());
  assert.deepEqual(dates(toLabelTimeRange(getSalesTrendPeriodRange("lastMonth", TZ))), ["2025-12-01", "2025-12-31"]);
});

test("completed week remains seven calendar days across DST; comparison keeps weekdays", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-16T16:00:00Z") });
  const period = getSalesTrendPeriodRange("lastWeek", TZ);
  assert.deepEqual(dates(toLabelTimeRange(period)), ["2026-03-08", "2026-03-14"]);
  assert.equal(getCalendarDayCountInRange(toLabelTimeRange(period), TZ), 7);
  for (const comparisonType of ["samePeriodPreviousMonth", "priorYear"] as const) {
    const range = compare("lastWeek", comparisonType);
    assert.equal(getCalendarDayCountInRange(toLabelTimeRange(range), TZ), 7);
    assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(range.startAt)), "Sun");
  }
  for (const comparisonType of ["samePeriodPreviousWeek", "samePeriodPreviousMonth", "priorYear"] as const) {
    const range = compare("yesterday", comparisonType);
    assert.equal(getCalendarDayCountInRange(toLabelTimeRange(range), TZ), 1);
    assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(range.startAt)), "Sun");
  }
});

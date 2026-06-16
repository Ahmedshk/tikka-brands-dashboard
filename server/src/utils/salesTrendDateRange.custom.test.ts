import test from "node:test";
import assert from "node:assert/strict";
import {
  getSalesTrendPeriodRange,
  getSalesTrendComparisonRange,
  getDatePartsInTz,
  toLabelTimeRange,
} from "./salesTrendDateRange.util.js";

const TZ = "America/New_York";
const BIZ_START = "04:00";

function partsAt(iso: string) {
  return getDatePartsInTz(new Date(iso), TZ);
}

test("custom single day + business start: label range is same civil day", () => {
  const period = getSalesTrendPeriodRange(
    "custom",
    TZ,
    "2026-06-14",
    "2026-06-14",
    BIZ_START,
  );
  const label = toLabelTimeRange(period);
  const labelStart = partsAt(label.startAt);
  const labelEnd = partsAt(label.endAt);
  assert.equal(labelStart.y, 2026);
  assert.equal(labelStart.m, 5);
  assert.equal(labelStart.d, 14);
  assert.equal(labelEnd.y, 2026);
  assert.equal(labelEnd.m, 5);
  assert.equal(labelEnd.d, 14);
});

test("custom single day + business start: data endAt still crosses midnight", () => {
  const period = getSalesTrendPeriodRange(
    "custom",
    TZ,
    "2026-06-14",
    "2026-06-14",
    BIZ_START,
  );
  const dataEnd = partsAt(period.endAt);
  assert.equal(dataEnd.d, 15, "business-day endAt is on the next civil morning");
  assert.ok(period.displayEndAt);
  const displayEnd = partsAt(period.displayEndAt);
  assert.equal(displayEnd.d, 14, "displayEndAt stays on the selected civil day");
});

test("custom multi-day + business start: label range shows civil start and end dates", () => {
  const period = getSalesTrendPeriodRange(
    "custom",
    TZ,
    "2026-06-14",
    "2026-06-20",
    BIZ_START,
  );
  const label = toLabelTimeRange(period);
  const labelStart = partsAt(label.startAt);
  const labelEnd = partsAt(label.endAt);
  assert.equal(labelStart.d, 14);
  assert.equal(labelEnd.d, 20);
  assert.equal(labelStart.m, 5);
  assert.equal(labelEnd.m, 5);
});

test("today + business start: label range is same civil day", () => {
  const period = getSalesTrendPeriodRange("today", TZ, undefined, undefined, BIZ_START);
  const label = toLabelTimeRange(period);
  const labelStart = partsAt(label.startAt);
  const labelEnd = partsAt(label.endAt);
  assert.equal(labelStart.y, labelEnd.y);
  assert.equal(labelStart.m, labelEnd.m);
  assert.equal(labelStart.d, labelEnd.d);
  assert.ok(period.displayStartAt);
  assert.ok(period.displayEndAt);
});

test("custom 2-day + samePeriodPreviousWeek: comparison label is shifted civil range", () => {
  const period = getSalesTrendPeriodRange(
    "custom",
    TZ,
    "2026-06-15",
    "2026-06-16",
    BIZ_START,
  );
  const comparison = getSalesTrendComparisonRange(
    "samePeriodPreviousWeek",
    period.startAt,
    period.endAt,
    TZ,
    {
      businessStartTime: BIZ_START,
      periodType: "custom",
      periodDisplayStartAt: period.displayStartAt ?? period.startAt,
      periodDisplayEndAt: period.displayEndAt ?? period.endAt,
    },
  );
  assert.ok(comparison);
  const label = toLabelTimeRange(comparison);
  const labelStart = partsAt(label.startAt);
  const labelEnd = partsAt(label.endAt);
  assert.equal(labelStart.d, 8);
  assert.equal(labelEnd.d, 9);
  assert.equal(labelStart.m, 5);
  assert.equal(labelEnd.m, 5);
});

test("today + 1DayPrior + business start: comparison label is single civil day", () => {
  const period = getSalesTrendPeriodRange("today", TZ, undefined, undefined, BIZ_START);
  const comparison = getSalesTrendComparisonRange(
    "1DayPrior",
    period.startAt,
    period.endAt,
    TZ,
    { businessStartTime: BIZ_START, periodType: "today", periodDisplayStartAt: period.displayStartAt ?? period.startAt, periodDisplayEndAt: period.displayEndAt ?? period.endAt },
  );
  assert.ok(comparison);
  const label = toLabelTimeRange(comparison);
  const labelStart = partsAt(label.startAt);
  const labelEnd = partsAt(label.endAt);
  assert.equal(labelStart.y, labelEnd.y);
  assert.equal(labelStart.m, labelEnd.m);
  assert.equal(labelStart.d, labelEnd.d);
  const periodLabel = toLabelTimeRange(period);
  const priorDay = partsAt(label.startAt);
  const todayLabel = partsAt(periodLabel.startAt);
  const priorExpected = { y: todayLabel.y, m: todayLabel.m, d: todayLabel.d - 1 };
  if (priorDay.d !== priorExpected.d) {
    const prev = new Date(todayLabel.y, todayLabel.m, todayLabel.d);
    prev.setDate(prev.getDate() - 1);
    assert.equal(priorDay.y, prev.getFullYear());
    assert.equal(priorDay.m, prev.getMonth());
    assert.equal(priorDay.d, prev.getDate());
  }
});

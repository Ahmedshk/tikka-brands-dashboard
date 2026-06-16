import test from "node:test";
import assert from "node:assert/strict";
import {
  getSalesTrendComparisonRange,
  getDatePartsInTz,
  getStartOfDayUtc,
  getEndOfDayUtc,
  getLast52WeeksCivilBounds,
  mapCurrentDayToWeekAlignedComparisonDay,
} from "./salesTrendDateRange.util.js";

const TZ = "America/New_York";

function partsAt(iso: string) {
  return getDatePartsInTz(new Date(iso), TZ);
}

test("thisMonth + samePeriodPreviousMonth uses aligned span (not full previous calendar month)", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 1, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange(
    "samePeriodPreviousMonth",
    periodStart,
    periodEnd,
    TZ,
    { periodType: "thisMonth" },
  );
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2026);
  assert.equal(s.m, 2);
  assert.equal(s.d, 4);
  assert.equal(e.y, 2026);
  assert.equal(e.m, 2);
  assert.equal(e.d, 11);
  assert.ok(new Date(r.startAt).getTime() <= new Date(r.endAt).getTime());
});

test("thisMonth + priorYear uses aligned span (not full prior-year month)", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 1, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange("priorYear", periodStart, periodEnd, TZ, {
    periodType: "thisMonth",
  });
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2025);
  assert.equal(s.m, 3);
  assert.equal(s.d, 2);
  assert.equal(e.y, 2025);
  assert.equal(e.m, 3);
  assert.equal(e.d, 9);
  assert.ok(new Date(r.startAt).getTime() <= new Date(r.endAt).getTime());
});

test("thisMonth + priorYear maps Jun 6 2026 Sat to Jun 7 2025 Sat (not same calendar date)", () => {
  const aligned = mapCurrentDayToWeekAlignedComparisonDay(2026, 5, 6, "priorYear", TZ);
  assert.ok(aligned);
  assert.equal(aligned.y, 2025);
  assert.equal(aligned.m, 5);
  assert.equal(aligned.d, 7);
  assert.notEqual(aligned.d, 6);
});

test("thisYear + priorYear is full prior calendar year", () => {
  const periodStart = getStartOfDayUtc(2026, 0, 1, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange("priorYear", periodStart, periodEnd, TZ, {
    periodType: "thisYear",
  });
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2025);
  assert.equal(s.m, 0);
  assert.equal(s.d, 1);
  assert.equal(e.y, 2025);
  assert.equal(e.m, 11);
  assert.equal(e.d, 31);
});

test("thisWeek + samePeriodPreviousMonth: partial current week still compares full Sun–Sat (Mar 8 – Mar 14)", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 5, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange(
    "samePeriodPreviousMonth",
    periodStart,
    periodEnd,
    TZ,
    { periodType: "thisWeek" },
  );
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2026);
  assert.equal(e.y, 2026);
  assert.equal(s.m, 2);
  assert.equal(s.d, 8);
  assert.equal(e.m, 2);
  assert.equal(e.d, 14);
  assert.ok(new Date(r.startAt).getTime() <= new Date(r.endAt).getTime());
});

test("thisWeek + samePeriodPreviousWeek: full prior Sun–Sat (anchor week) Sun Mar 29 – Sat Apr 4", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 5, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange(
    "samePeriodPreviousWeek",
    periodStart,
    periodEnd,
    TZ,
    { periodType: "thisWeek" },
  );
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.m, 2);
  assert.equal(s.d, 29);
  assert.equal(e.m, 3);
  assert.equal(e.d, 4);
});

test("thisWeek + priorYear: full Sun–Sat in prior year (Apr 2025 week aligned to Apr 2026 week 2)", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 5, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange("priorYear", periodStart, periodEnd, TZ, {
    periodType: "thisWeek",
  });
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2025);
  assert.equal(e.y, 2025);
  assert.equal(s.m, 3);
  assert.equal(s.d, 6);
  assert.equal(e.m, 3);
  assert.equal(e.d, 12);
});

test("thisWeek + samePeriodPreviousMonth: full Sun–Sat week → Sun Mar 8 – Sat Mar 14", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 5, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 11, TZ).toISOString();
  const r = getSalesTrendComparisonRange(
    "samePeriodPreviousMonth",
    periodStart,
    periodEnd,
    TZ,
    { periodType: "thisWeek" },
  );
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.m, 2);
  assert.equal(s.d, 8);
  assert.equal(e.m, 2);
  assert.equal(e.d, 14);
});

test("last7days + samePeriodPreviousMonth: Tue week4 / Mon week5 of March → Feb 24 – Mar 2 (span crosses weeks)", () => {
  const periodStart = getStartOfDayUtc(2026, 2, 24, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 2, 30, TZ).toISOString();
  const r = getSalesTrendComparisonRange(
    "samePeriodPreviousMonth",
    periodStart,
    periodEnd,
    TZ,
    { periodType: "last7days" },
  );
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2026);
  assert.equal(e.y, 2026);
  assert.equal(s.m, 1);
  assert.equal(s.d, 24);
  assert.equal(e.m, 2);
  assert.equal(e.d, 2);
  assert.ok(new Date(r.startAt).getTime() <= new Date(r.endAt).getTime());
});

test("last7days + samePeriodPreviousMonth: Thu week1 / Wed week2 of April → Mar 5 – Mar 11", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 2, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange(
    "samePeriodPreviousMonth",
    periodStart,
    periodEnd,
    TZ,
    { periodType: "last7days" },
  );
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2026);
  assert.equal(e.y, 2026);
  assert.equal(s.m, 2);
  assert.equal(s.d, 5);
  assert.equal(e.m, 2);
  assert.equal(e.d, 11);
  assert.ok(new Date(r.startAt).getTime() <= new Date(r.endAt).getTime());
});

test("last7days + priorYear uses week logic in prior year (not plain −1y same month/day)", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 2, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange("priorYear", periodStart, periodEnd, TZ, {
    periodType: "last7days",
  });
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2025);
  assert.equal(e.y, 2025);
  const switchOnly = getSalesTrendComparisonRange("priorYear", periodStart, periodEnd, TZ, {});
  assert.ok(switchOnly);
  const swS = partsAt(switchOnly.startAt);
  assert.ok(
    s.d !== swS.d || s.m !== swS.m,
    "rolling priorYear should differ from plain switch (−1y same month/day)",
  );
});

test("last30days spanning March–April + priorYear uses 7-day blocks: Tue week2 Mar / Wed week2 Apr in prior year", () => {
  const periodStart = getStartOfDayUtc(2026, 2, 10, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange("priorYear", periodStart, periodEnd, TZ, {
    periodType: "last30days",
  });
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2025);
  assert.equal(s.m, 2);
  assert.equal(s.d, 11);
  assert.equal(e.y, 2025);
  assert.equal(e.m, 3);
  assert.equal(e.d, 9);
});

test("getLast52WeeksCivilBounds: Apr 8 2026 → Apr 8 2025 through Apr 8 2026", () => {
  const r = getLast52WeeksCivilBounds({ y: 2026, m: 3, d: 8 });
  assert.deepEqual(r.start, { y: 2025, m: 3, d: 8 });
  assert.deepEqual(r.end, { y: 2026, m: 3, d: 8 });
});

test("getLast52WeeksCivilBounds: Feb 29 2024 → Feb 28 2023 through Feb 29 2024", () => {
  const r = getLast52WeeksCivilBounds({ y: 2024, m: 1, d: 29 });
  assert.deepEqual(r.start, { y: 2023, m: 1, d: 28 });
  assert.deepEqual(r.end, { y: 2024, m: 1, d: 29 });
});

test("last52weeks-style range + 52WeeksPrior shifts both civil endpoints back one calendar year", () => {
  const periodStart = getStartOfDayUtc(2025, 3, 8, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange("52WeeksPrior", periodStart, periodEnd, TZ, {
    periodType: "last52weeks",
  });
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2024);
  assert.equal(s.m, 3);
  assert.equal(s.d, 8);
  assert.equal(e.y, 2025);
  assert.equal(e.m, 3);
  assert.equal(e.d, 8);
});

test("today + 52WeeksPrior (switch path) shifts each civil endpoint back 364 days", () => {
  const periodStart = getStartOfDayUtc(2026, 3, 8, TZ).toISOString();
  const periodEnd = getEndOfDayUtc(2026, 3, 8, TZ).toISOString();
  const r = getSalesTrendComparisonRange("52WeeksPrior", periodStart, periodEnd, TZ, {
    periodType: "today",
  });
  assert.ok(r);
  const s = partsAt(r.startAt);
  const e = partsAt(r.endAt);
  assert.equal(s.y, 2025);
  assert.equal(s.m, 3);
  assert.equal(s.d, 9);
  assert.equal(e.y, 2025);
  assert.equal(e.m, 3);
  assert.equal(e.d, 9);
});

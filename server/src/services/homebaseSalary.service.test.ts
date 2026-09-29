import assert from "node:assert/strict";
import { test } from "node:test";
import { HomebaseSalaryHistoryModel } from "../models/homebaseSalaryHistory.model.js";
import { DashboardCacheModel } from "../models/dashboardCache.model.js";
import { HomebaseTimecardModel } from "../models/homebaseTimecard.model.js";
import { observeHomebaseSalaries, getSalaryDaysForRange } from "./homebaseSalary.service.js";
import type { HomebaseEmployee } from "./homebase.service.js";
import type { SalarySnapshot } from "../utils/homebaseSalary.util.js";
import { HomebaseTimecardDailyRollupModel } from "../models/homebaseTimecardDailyRollup.model.js";
import { HomebaseTimecardHourlyRollupModel } from "../models/homebaseTimecardHourlyRollup.model.js";
import { homebaseTimecardDailyRollupCache } from "../utils/dailyRollupCaches.util.js";
import { homebaseTimecardHourlyRollupCache } from "../utils/homebaseTimecardHourlyRollupCache.util.js";
import {
  getLaborCostInRangeFromCache, getLaborAndHoursTimeSeriesInRangeFromCache,
  fetchHourlyLaborCostPerHourFromCache,
} from "./integrationCacheRead.service.js";

test("sync seeds once, preserves history, updates same-day rates and ends removed salaries", async t => {
  const rows = new Map<string, SalarySnapshot>();
  let invalidations = 0;
  t.mock.method(HomebaseSalaryHistoryModel, "updateOne", (filter: { effectiveFrom: string }, update: {
    $setOnInsert?: SalarySnapshot; $set?: SalarySnapshot;
  }) => ({ exec: async () => {
    const existed = rows.has(filter.effectiveFrom);
    if (update.$set) rows.set(filter.effectiveFrom, { ...update.$set, effectiveFrom: filter.effectiveFrom });
    if (update.$setOnInsert && !existed) rows.set(filter.effectiveFrom, { ...update.$setOnInsert, effectiveFrom: filter.effectiveFrom });
    return { upsertedCount: existed ? 0 : 1 };
  } }));
  t.mock.method(HomebaseSalaryHistoryModel, "findOne", (filter: { effectiveFrom: { $lte: string } }) => ({
    sort: () => ({ lean: () => ({ exec: async () => [...rows.values()]
      .filter(row => row.effectiveFrom <= filter.effectiveFrom.$lte)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1) ?? null }) }),
  }));
  t.mock.method(DashboardCacheModel, "updateMany", () => ({ exec: async () => { invalidations++; } }));
  const employee = (rate: number, type = "salary"): HomebaseEmployee => ({
    id: 1, first_name: "", last_name: "", job: { id: 10, wage_type: type, wage_rate: rate, location_uuid: "loc" },
  });
  const sync = (day: string, rate: number, type = "salary") => observeHomebaseSalaries(
    "507f1f77bcf86cd799439011", "loc", [employee(rate, type)],
    { timezone: "America/Denver", businessStartTime: "04:00" }, new Date(`${day}T18:00:00Z`),
  );
  await sync("2026-09-29", 36400);
  assert.equal(rows.size, 1);
  assert.equal(rows.get("2026-09-13")?.salaries[0]?.annualSalary, 36400);
  await sync("2026-09-29", 36400);
  assert.equal(invalidations, 1);
  await sync("2026-09-30", 72800);
  assert.equal(rows.get("2026-09-13")?.salaries[0]?.annualSalary, 36400);
  assert.equal(rows.get("2026-09-30")?.salaries[0]?.annualSalary, 72800);
  await sync("2026-09-30", 109200);
  assert.equal(rows.size, 2);
  assert.equal(rows.get("2026-09-30")?.salaries[0]?.annualSalary, 109200);
  await sync("2026-10-01", 12, "hourly");
  assert.deepEqual(rows.get("2026-10-01")?.salaries, []);
  assert.equal(invalidations, 4);
  await assert.rejects(sync("2026-10-02", -1));
  assert.equal(rows.size, 3, "invalid API data cannot change salary history");
});

test("salary reads use location-scoped history and full business-day timecards to avoid double counting", async t => {
  const locationId = "507f1f77bcf86cd799439011";
  t.mock.method(HomebaseSalaryHistoryModel, "find", (filter: { locationId: unknown }) => {
    assert.equal(String(filter.locationId), locationId);
    return { sort: () => ({ lean: () => ({ exec: async () => [{
      effectiveFrom: "2026-09-13", salaries: [{ jobId: 10, annualSalary: 36400 }, { jobId: 11, annualSalary: 72800 }],
    }] }) }) };
  });
  t.mock.method(HomebaseTimecardModel, "find", (filter: { locationId: unknown; clockInAt: { $gte: Date; $lte: Date } }) => {
    assert.equal(String(filter.locationId), locationId);
    assert.equal(filter.clockInAt.$gte.toISOString(), "2026-09-27T10:00:00.000Z");
    assert.equal(filter.clockInAt.$lte.toISOString(), "2026-09-28T09:59:59.999Z");
    return { select: () => ({ lean: () => ({ exec: async () => [{ raw: {
      job_id: 10, clock_in: "2026-09-27T12:00:00-06:00", labor: { wage_type: "hourly", costs: 80 },
    } }] }) }) };
  });
  const days = await getSalaryDaysForRange(locationId,
    { startAt: "2026-09-27T10:00:00.000Z", endAt: "2026-09-27T18:00:00.000Z" },
    { timezone: "America/Denver", businessStartTime: "04:00" });
  assert.deepEqual(days, [{ businessDateKey: "2026-09-27", cost: 200 }]);
});

test("KPI, daily trend and hourly totals add salaries exactly once with raw and rollup reads", async t => {
  const locationId = "507f1f77bcf86cd799439012";
  const context = { timezone: "America/Denver", businessStartTime: "04:00" };
  const range = { startAt: "2026-09-27T10:00:00.000Z", endAt: "2026-09-28T09:59:59.999Z" };
  const day = "2026-09-27";
  let useRollups = false;
  const query = (rows: unknown[]) => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) });
  t.mock.method(HomebaseSalaryHistoryModel, "find", () => ({ sort: () => ({ lean: () => ({ exec: async () => [{
    effectiveFrom: "2026-09-13", salaries: [{ jobId: 10, annualSalary: 36400 }],
  }] }) }) }));
  t.mock.method(HomebaseTimecardModel, "find", () => query([{ raw: {
    id: 1, user_id: 1, job_id: 1, clock_in: "2026-09-27T12:00:00-06:00", clock_out: "2026-09-27T16:00:00-06:00",
    labor: { wage_type: "hourly", costs: 96.96, paid_hours: 4 },
  } }]));
  t.mock.method(HomebaseTimecardDailyRollupModel, "find", () => query(useRollups ? [{
    businessDateKey: day, totalLaborCost: 96.96, totalPaidHours: 4,
  }] : []));
  t.mock.method(HomebaseTimecardHourlyRollupModel, "find", () => query(useRollups
    ? Array.from({ length: 24 }, (_, slotIndex) => ({ businessDateKey: day, slotIndex, laborCost: 96.96 / 24 })) : []));

  for (const rollups of [false, true]) {
    useRollups = rollups;
    homebaseTimecardDailyRollupCache.invalidateForLocation(locationId);
    homebaseTimecardHourlyRollupCache.invalidateForLocation(locationId);
    const cost = await getLaborCostInRangeFromCache(locationId, range, context);
    assert.ok(Math.abs(cost - 196.96) < 1e-9);
    const hourly = await fetchHourlyLaborCostPerHourFromCache(locationId, range, context.timezone, context.businessStartTime);
    assert.ok(Math.abs(hourly.reduce((sum, value) => sum + value, 0) - cost) < 1e-9);
    const trend = await getLaborAndHoursTimeSeriesInRangeFromCache(locationId, range,
      context.timezone, "daily", undefined, context.businessStartTime);
    assert.ok(Math.abs(trend.laborCost[0]! - cost) < 1e-9);
    assert.equal(trend.hours[0], 4, "salaries must not add invented paid hours");
  }
});

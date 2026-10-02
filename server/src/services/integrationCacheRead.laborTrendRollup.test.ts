import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HomebaseTimecardModel } from "../models/homebaseTimecard.model.js";
import { HomebaseTimecardDailyRollupModel } from "../models/homebaseTimecardDailyRollup.model.js";
import { HomebaseSalaryHistoryModel } from "../models/homebaseSalaryHistory.model.js";
import { homebaseTimecardDailyRollupCache } from "../utils/dailyRollupCaches.util.js";
import { _clearTimecardRangeCacheForTests } from "../utils/timecardRangeCache.util.js";
import { businessDayUtcRangeIsoStrings } from "../utils/businessDayUtcRange.util.js";
import { getOrderedBucketsAndLabels, type SalesTrendGranularity } from "../utils/homebaseOrderedBuckets.util.js";
import { getLaborAndHoursTimeSeriesInRangeFromCache } from "./integrationCacheRead.service.js";
import { tryGetLaborTimeSeriesFromDailyRollups } from "./integrationRollupRead.service.js";
import type { SalarySnapshot } from "../utils/homebaseSalary.util.js";
import { logger } from "../utils/logger.util.js";

const enabled = (process.env.ROLLUP_READ_ENABLED ?? "true").trim().toLowerCase() !== "false";
const rollupTest = enabled ? test : test.skip;
const locationId = "507f1f77bcf86cd799439081";
const TZ = "America/Denver";
const BST = "04:00";
const keys = ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];

function fixture(t: TestContext, dates = keys, timezone = TZ, snapshots: SalarySnapshot[] = []) {
  t.mock.method(logger, "info", () => {});
  _clearTimecardRangeCacheForTests();
  homebaseTimecardDailyRollupCache.invalidateForLocation(locationId);
  const cards = dates.flatMap((date, index) => index === 1 ? [] : [{
    job_id: 1,
    clock_in: new Date(new Date(businessDayUtcRangeIsoStrings(timezone, BST, date).startAt).getTime() + 8 * 3600_000).toISOString(),
    clock_out: new Date(new Date(businessDayUtcRangeIsoStrings(timezone, BST, date).startAt).getTime() + 12 * 3600_000).toISOString(),
    labor: { costs: (index + 1) * 17.5, paid_hours: index + 1, regular_hours: 99, wage_type: "hourly" },
  }]);
  const state = {
    useRollups: true, rawReads: 0, salaryReads: 0, rollupReads: 0,
    rows: dates.map((businessDateKey, index) => ({ businessDateKey,
      totalLaborCost: index === 1 ? 0 : (index + 1) * 17.5,
      totalPaidHours: index === 1 ? 0 : index + 1,
    })),
  };
  const query = (rows: unknown[]) => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) });
  t.mock.method(HomebaseTimecardDailyRollupModel, "find", (filter: { locationId: unknown; businessDateKey: { $in: string[] } }) => {
    assert.equal(String(filter.locationId), locationId);
    state.rollupReads++;
    // Return reverse order to verify alignment uses keys, not Mongo row order.
    return query(state.useRollups ? state.rows.filter(row => filter.businessDateKey.$in.includes(row.businessDateKey)).reverse() : []);
  });
  t.mock.method(HomebaseSalaryHistoryModel, "find", () => ({ sort: () => ({ lean: () => ({ exec: async () => snapshots }) }) }));
  t.mock.method(HomebaseTimecardModel, "find", (filter: {
    locationId: unknown; clockInAt: { $gte: Date; $lte: Date }; "raw.job_id"?: { $in: number[] };
  }) => {
    assert.equal(String(filter.locationId), locationId);
    const salaryJobs = filter["raw.job_id"];
    if (salaryJobs) state.salaryReads++; else state.rawReads++;
    return query(cards.filter(card => new Date(card.clock_in) >= filter.clockInAt.$gte && new Date(card.clock_in) <= filter.clockInAt.$lte &&
      (!salaryJobs || salaryJobs.$in.includes(card.job_id))).map(raw => ({ raw })));
  });
  const range = { startAt: businessDayUtcRangeIsoStrings(timezone, BST, dates[0]!).startAt,
    endAt: businessDayUtcRangeIsoStrings(timezone, BST, dates.at(-1)!).endAt };
  function clear() {
    _clearTimecardRangeCacheForTests();
    homebaseTimecardDailyRollupCache.invalidateForLocation(locationId);
  }
  t.after(clear);
  const read = (granularity: SalesTrendGranularity, selectedRange = range) =>
    getLaborAndHoursTimeSeriesInRangeFromCache(locationId, selectedRange, timezone, granularity, undefined, BST);
  return { state, range, read, clear, cards };
}

for (const granularity of ["daily", "weekly", "monthly"] as const) {
  rollupTest(`${granularity} rollups match timecards across week/month boundaries, including zero days`, async t => {
    const f = fixture(t, [...keys, "2026-10-04"]);
    const rolled = await f.read(granularity);
    assert.equal(f.state.rawReads, 0, "a complete rollup hit must not load raw trend timecards");
    assert.equal(f.state.rollupReads, 1);
    assert.equal(rolled.laborCost.reduce((sum, value) => sum + value, 0), 595);
    assert.equal(rolled.hours.reduce((sum, value) => sum + value, 0), 34);
    if (granularity === "daily") assert.equal(rolled.laborCost[1], 0);
    if (granularity === "weekly") assert.equal(rolled.laborCost.length, 2);
    f.clear();
    f.state.useRollups = false;
    const raw = await f.read(granularity);
    assert.equal(f.state.rawReads, 1);
    assert.deepEqual(rolled, raw);
  });
}

rollupTest("missing or invalid daily rows fall back for the entire range without double counting", async t => {
  const f = fixture(t);
  const complete = [...f.state.rows];
  for (const rows of [complete.slice(1), complete.map((row, index) => index === 2 ? { ...row, totalPaidHours: Number.NaN } : row),
    complete.map((row, index) => index === 2 ? { ...row, totalLaborCost: Number.NaN } : row)]) {
    f.clear();
    f.state.rows = rows;
    const result = await f.read("daily");
    assert.equal(result.laborCost.reduce((sum, value) => sum + value, 0), 455);
    assert.equal(result.hours.reduce((sum, value) => sum + value, 0), 26);
  }
  assert.equal(f.state.rawReads, 3);
});

rollupTest("leading/trailing partial days and hourly charts keep the original timecard calculation", async t => {
  const f = fixture(t);
  for (const range of [
    { ...f.range, startAt: new Date(new Date(f.range.startAt).getTime() + 3600_000).toISOString() },
    { ...f.range, endAt: new Date(new Date(f.range.endAt).getTime() - 3600_000).toISOString() },
  ]) {
    await f.read("daily", range);
  }
  const hourly = await f.read("hourly");
  assert.equal(f.state.rollupReads, 0, "incompatible ranges should skip the rollup query");
  assert.equal(f.state.rawReads, 3);
  assert.ok(Math.abs(hourly.laborCost.reduce((sum, value) => sum + value, 0) - 455) < 1e-9);
  assert.ok(Math.abs(hourly.hours.reduce((sum, value) => sum + value, 0) - 26) < 1e-9);
});

rollupTest("salary rate changes, transitions and salary timecard costs are preserved on both paths", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-20T18:00:00Z") });
  const f = fixture(t, keys, TZ, [
    { effectiveFrom: "2026-09-13", salaries: [{ jobId: 10, annualSalary: 36400 }] },
    { effectiveFrom: "2026-09-30", salaries: [{ jobId: 10, annualSalary: 72800 }] },
  ]);
  // On September 29 the salaried job is still hourly; on September 30 its
  // salary timecard already includes $20. Both paths must avoid double counting.
  f.cards.push({ job_id: 10, clock_in: "2026-09-29T18:00:00.000Z", clock_out: "2026-09-29T19:00:00.000Z",
    labor: { costs: 12, paid_hours: 1, regular_hours: 1, wage_type: "hourly" } });
  f.cards.push({ job_id: 10, clock_in: "2026-09-30T18:00:00.000Z", clock_out: "2026-09-30T19:00:00.000Z",
    labor: { costs: 20, paid_hours: 0, regular_hours: 0, wage_type: "salary" } });
  f.state.rows[2]!.totalLaborCost += 12;
  f.state.rows[2]!.totalPaidHours += 1;
  f.state.rows[3]!.totalLaborCost += 20;
  for (const granularity of ["daily", "weekly", "monthly"] as const) {
    f.clear();
    f.state.useRollups = true;
    const before = f.state.rawReads;
    const rolled = await f.read(granularity);
    assert.equal(f.state.rawReads, before);
    assert.equal(rolled.laborCost.reduce((sum, value) => sum + value, 0), 1467);
    assert.equal(rolled.hours.reduce((sum, value) => sum + value, 0), 27);
    f.clear();
    f.state.useRollups = false;
    assert.deepEqual(await f.read(granularity), rolled);
  }
  assert.equal(f.state.salaryReads, 6, "salary checks remain separate from raw trend scans");
});

rollupTest("business-day grouping matches raw trends across DST, midnight and year boundaries", async t => {
  for (const [dates, timezone] of [
    [["2026-03-07", "2026-03-08", "2026-03-09"], "America/New_York"],
    [["2025-12-31", "2026-01-01", "2026-01-02"], "Asia/Karachi"],
  ] as const) {
    const f = fixture(t, [...dates], timezone);
    // Clock-in just before the next business start belongs to the prior day,
    // even though its civil calendar date has advanced.
    f.cards[0]!.clock_in = new Date(new Date(businessDayUtcRangeIsoStrings(timezone, BST, dates[0]).endAt).getTime() - 3600_000).toISOString();
    f.cards[0]!.clock_out = new Date(new Date(f.cards[0]!.clock_in).getTime() + 2 * 3600_000).toISOString();
    for (const granularity of ["daily", "weekly", "monthly"] as const) {
      f.clear(); f.state.useRollups = true;
      const before = f.state.rawReads;
      const rolled = await f.read(granularity);
      assert.equal(f.state.rawReads, before);
      f.clear(); f.state.useRollups = false;
      assert.deepEqual(await f.read(granularity), rolled);
    }
  }
});

test("disabled rollup reads retain the timecard path", async t => {
  if (enabled) {
    // The feature flag is read when the module loads; verify it in a fresh process.
    const childEnv = { ...process.env, ROLLUP_READ_ENABLED: "false" };
    Reflect.deleteProperty(childEnv, "NODE_TEST_CONTEXT");
    const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-reporter=spec", "--test-name-pattern=disabled rollup reads",
      fileURLToPath(import.meta.url)], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: childEnv, encoding: "utf8", timeout: 30_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /pass 1\b/, "the child process must execute the disabled-flag test");
    return;
  }
  const f = fixture(t);
  const result = await f.read("daily");
  assert.equal(f.state.rollupReads, 0);
  assert.equal(f.state.rawReads, 1);
  assert.equal(result.laborCost.reduce((sum, value) => sum + value, 0), 455);
});

rollupTest("rollup series respect supplied chart key order and reject unmapped dates", async t => {
  const f = fixture(t);
  const bucketKeys = getOrderedBucketsAndLabels(f.range, TZ, "daily", { businessStartTime: BST }).keys;
  const result = await tryGetLaborTimeSeriesFromDailyRollups(locationId, f.range, TZ, BST, "daily", [...bucketKeys].reverse());
  assert.deepEqual(result?.laborCost, f.state.rows.map(row => row.totalLaborCost).reverse());
  assert.equal(await tryGetLaborTimeSeriesFromDailyRollups(locationId, f.range, TZ, BST, "daily", bucketKeys.slice(1)), null);
});

rollupTest("prefetched daily rows avoid database reads and caches remain location-scoped", async t => {
  const f = fixture(t);
  const otherLocation = "507f1f77bcf86cd799439082";
  for (const row of f.state.rows) {
    homebaseTimecardDailyRollupCache.write(otherLocation, row.businessDateKey, { ...row, totalLaborCost: 99999 });
    homebaseTimecardDailyRollupCache.write(locationId, row.businessDateKey, row);
  }
  const result = await f.read("daily");
  assert.equal(f.state.rollupReads, 0);
  assert.equal(f.state.rawReads, 0);
  assert.equal(result.laborCost.reduce((sum, value) => sum + value, 0), 455);
  t.after(() => homebaseTimecardDailyRollupCache.invalidateForLocation(otherLocation));
});

rollupTest("complete zero-valued rollups are hits, not missing data", async t => {
  const f = fixture(t);
  f.state.rows = f.state.rows.map(row => ({ ...row, totalLaborCost: 0, totalPaidHours: 0 }));
  const result = await f.read("daily");
  assert.equal(f.state.rawReads, 0);
  assert.deepEqual(result.laborCost, keys.map(() => 0));
  assert.deepEqual(result.hours, keys.map(() => 0));
});

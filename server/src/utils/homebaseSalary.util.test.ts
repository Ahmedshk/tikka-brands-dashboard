import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateSalaryDays, salaryRatesFromEmployees, addSalaryToHourlySlots, addSalaryToBuckets,
  type SalarySnapshot,
} from "./homebaseSalary.util.js";
import type { HomebaseEmployee, HomebaseTimecard } from "../services/homebase.service.js";
import { getOrderedBucketsAndLabels } from "./homebaseOrderedBuckets.util.js";
import { businessDayUtcRangeIsoStrings } from "./businessDayUtcRange.util.js";
import { parseHomebaseEmployeesJsonPayload } from "./homebaseEmployeesPayloadHelpers.util.js";

const history: SalarySnapshot[] = [{ effectiveFrom: "2026-09-13", salaries: [
  { jobId: 1, annualSalary: 48000 }, { jobId: 2, annualSalary: 4000 },
  { jobId: 3, annualSalary: 5000 }, { jobId: 4, annualSalary: 6666.66 },
] }];
const calculate = (keys: string[], snapshots = history, cards: HomebaseTimecard[] = []) =>
  calculateSalaryDays(keys, snapshots, cards, "America/Denver", "04:00", "2026-09-29");
const card = (jobId: number, type: string, cost: number): HomebaseTimecard => ({
  id: jobId, job_id: jobId, user_id: jobId, clock_in: "2026-09-27T12:00:00-06:00",
  labor: { wage_type: type, costs: cost },
});

test("matches Sunday sample and adds salary on days with no timecards", () => {
  const days = calculate(["2026-09-27", "2026-09-29"]);
  assert.equal(Math.round(96.96 + days[0]!.cost), 272);
  assert.equal(Math.round(days[1]!.cost), 175);
});
test("uses dated rates without changing prior days; removal ends salary", () => {
  const snapshots = [...history, { effectiveFrom: "2026-09-28", salaries: [{ jobId: 1, annualSalary: 36400 }] },
    { effectiveFrom: "2026-09-29", salaries: [] }];
  const days = calculate(["2026-09-27", "2026-09-28", "2026-09-29"], snapshots);
  assert.ok(Math.abs(days[0]!.cost - 63666.66 / 364) < 1e-9);
  assert.equal(days[1]!.cost, 100);
  assert.equal(days[2]!.cost, 0);
});
test("cutoff, future dates, duplicate dates, and unknown history never inflate salary", () => {
  assert.equal(calculate(["2026-09-12", "2026-09-13", "2026-09-13", "2026-09-30"]).length, 1);
  assert.equal(calculate(["2026-09-27"], [{ effectiveFrom: "2026-09-28", salaries: history[0]!.salaries }])[0]!.cost, 0);
});
test("hourly transition days and existing salary card costs are not double counted", () => {
  const snapshots = [{ effectiveFrom: "2026-09-13", salaries: [{ jobId: 1, annualSalary: 36400 }] }];
  assert.equal(calculate(["2026-09-27"], snapshots, [card(1, "hourly", 90)])[0]!.cost, 0);
  assert.equal(calculate(["2026-09-27"], snapshots, [card(1, "salary", 30)])[0]!.cost, 70);
  assert.equal(calculate(["2026-09-27"], snapshots, [card(1, "salary", 120)])[0]!.cost, 0);
});
test("overnight clock-in uses location business date", () => {
  const overnight = { ...card(1, "hourly", 90), clock_in: "2026-09-28T02:00:00-06:00" };
  const snapshots = [{ effectiveFrom: "2026-09-13", salaries: [{ jobId: 1, annualSalary: 36400 }] }];
  const days = calculate(["2026-09-27", "2026-09-28"], snapshots, [overnight]);
  assert.deepEqual(days.map(d => d.cost), [0, 100]);
});
test("employee roster is location scoped, excludes archived and hourly jobs, rejects invalid salaries", () => {
  const employee = (id: number, type: string, rate: number | null, archived: string | null = null): HomebaseEmployee => ({
    id, first_name: "", last_name: "", job: { id, wage_type: type, wage_rate: rate, archived_at: archived, location_uuid: "loc" },
  });
  assert.deepEqual(salaryRatesFromEmployees([
    employee(1, "hourly", 12), employee(2, "salary", 36400), employee(3, "salary", 1000, "2026-09-01"),
    employee(4, "salary", 0),
  ], "loc"), [{ jobId: 2, annualSalary: 36400 }, { jobId: 4, annualSalary: 0 }]);
  assert.throws(() => salaryRatesFromEmployees([employee(1, "salary", null)], "loc"));
  assert.throws(() => salaryRatesFromEmployees([employee(1, "salary", 1)], "other"));
  assert.throws(() => salaryRatesFromEmployees([employee(1, "salary", 1), employee(1, "salary", 1)], "loc"));
});
test("salary sync rejects malformed API envelopes instead of treating them as an empty roster", () => {
  assert.throws(() => parseHomebaseEmployeesJsonPayload({ error: "Unavailable" }, true));
  assert.throws(() => parseHomebaseEmployeesJsonPayload(null, true));
  assert.throws(() => parseHomebaseEmployeesJsonPayload({ errors: [] }, true));
  assert.deepEqual(parseHomebaseEmployeesJsonPayload([], true), []);
  assert.deepEqual(parseHomebaseEmployeesJsonPayload({ employees: [] }, true), []);
});
test("hourly display adds salary once without mutating timecard rollups", () => {
  const base = Array<number>(24).fill(1);
  const result = addSalaryToHourlySlots(base, [{ businessDateKey: "2026-09-27", cost: 240 }]);
  assert.equal(result.reduce((a, b) => a + b, 0), 264);
  assert.equal(base[0], 1);
});
test("daily, weekly, monthly and hourly salary buckets conserve a full day's cost, including DST", () => {
  for (const day of ["2026-09-27", "2026-11-01", "2027-03-14"]) {
    for (const granularity of ["hourly", "daily", "weekly", "monthly"] as const) {
      const range = businessDayUtcRangeIsoStrings("America/Denver", "00:00", day);
      const { keys } = getOrderedBucketsAndLabels(range, "America/Denver", granularity, { businessStartTime: "00:00" });
      const buckets = Object.fromEntries(keys.map(key => [key, 0]));
      addSalaryToBuckets([{ businessDateKey: day, cost: 240 }], buckets, "America/Denver", "00:00", granularity);
      assert.equal(Object.values(buckets).reduce((a, b) => a + b, 0), 240, `${day} ${granularity}`);
    }
  }
});

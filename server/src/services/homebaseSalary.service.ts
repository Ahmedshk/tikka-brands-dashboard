import mongoose from "mongoose";
import { HomebaseSalaryHistoryModel } from "../models/homebaseSalaryHistory.model.js";
import { HomebaseTimecardModel } from "../models/homebaseTimecard.model.js";
import { LocationModel } from "../models/location.model.js";
import { DashboardCacheModel } from "../models/dashboardCache.model.js";
import type { HomebaseEmployee, HomebaseTimecard } from "./homebase.service.js";
import type { TimeRange } from "../utils/businessHours.util.js";
import {
  businessDateKeyForInstant, businessDateKeysIntersectingUtcRange,
  businessDayUtcRangeIsoStrings,
} from "../utils/businessDayUtcRange.util.js";
import {
  calculateSalaryDays, salaryRatesFromEmployees, SALARY_REPORTING_START,
  type SalaryDay, type SalarySnapshot,
} from "../utils/homebaseSalary.util.js";

export interface SalaryContext { timezone: string; businessStartTime: string }

export async function invalidateSalaryDashboardCaches(): Promise<void> {
  // Includes all-location scopes. Keep cache definitions so the refresh job can rebuild them.
  await DashboardCacheModel.updateMany({ endpoint: { $in: [
    "command-center.kpis", "command-center.alerts", "sales-labor.kpis", "sales-labor.hourly-breakdown",
    "sales-labor.sales-trend", "sales-labor.sales-trend-kpi",
  ] } }, { $set: { computedAt: new Date(0) } }).exec();
}

/**
 * First sync seeds the explicitly authorized retrospective baseline. Later polls
 * only change the current business date; API updated_at is not a wage effective date.
 */
export async function observeHomebaseSalaries(
  locationId: string, locationUuid: string, employees: HomebaseEmployee[],
  context: SalaryContext, now = new Date(),
): Promise<void> {
  const effectiveFrom = businessDateKeyForInstant(now, context.timezone, context.businessStartTime);
  const salaries = salaryRatesFromEmployees(employees, locationUuid);
  if (effectiveFrom < SALARY_REPORTING_START) return;
  const baseline = await HomebaseSalaryHistoryModel.updateOne({
    locationId, effectiveFrom: SALARY_REPORTING_START,
  }, { $setOnInsert: { salaries, source: "baseline", observedAt: now } }, { upsert: true }).exec();
  const latest = await HomebaseSalaryHistoryModel.findOne({
    locationId, effectiveFrom: { $lte: effectiveFrom },
  }).sort({ effectiveFrom: -1 }).lean().exec();
  const previous = latest?.salaries.map(({ jobId, annualSalary }) => ({ jobId, annualSalary }))
    .sort((a, b) => a.jobId - b.jobId);
  if (JSON.stringify(previous) === JSON.stringify(salaries)) {
    if (baseline.upsertedCount) await invalidateSalaryDashboardCaches();
    return;
  }
  await HomebaseSalaryHistoryModel.updateOne({ locationId, effectiveFrom }, {
    $set: { salaries, source: "observed", observedAt: now },
  }, { upsert: true }).exec();
  await invalidateSalaryDashboardCaches();
}

/** Salary stays separate from timecard rollups, so every read adds it exactly once. */
export async function getSalaryDaysForRange(
  locationId: string, range: TimeRange, context?: SalaryContext,
): Promise<SalaryDay[]> {
  const loc = context ?? await LocationModel.findById(locationId)
    .select({ timezone: 1, businessStartTime: 1 }).lean().exec();
  if (!loc?.timezone) return [];
  const timezone = loc.timezone;
  const businessStartTime = loc.businessStartTime || "00:00";
  const today = businessDateKeyForInstant(new Date(), timezone, businessStartTime);
  const keys = businessDateKeysIntersectingUtcRange(range.startAt, range.endAt, timezone, businessStartTime)
    .filter(key => key >= SALARY_REPORTING_START && key <= today);
  const first = keys[0];
  const last = keys.at(-1);
  if (!first || !last) return [];
  const oid = new mongoose.Types.ObjectId(locationId);
  const snapshots: SalarySnapshot[] = await HomebaseSalaryHistoryModel.find({
    locationId: oid, effectiveFrom: { $lte: last },
  }).sort({ effectiveFrom: 1 }).lean().exec();
  if (!snapshots.length) return [];
  const jobIds = [...new Set(snapshots.flatMap(s => s.salaries.map(r => r.jobId)))];
  if (!jobIds.length) return [];
  const startAt = businessDayUtcRangeIsoStrings(timezone, businessStartTime, first).startAt;
  const endAt = businessDayUtcRangeIsoStrings(timezone, businessStartTime, last).endAt;
  const cards = await HomebaseTimecardModel.find({
    locationId: oid, clockInAt: { $gte: new Date(startAt), $lte: new Date(endAt) },
    "raw.job_id": { $in: jobIds },
  }).select({ "raw.job_id": 1, "raw.clock_in": 1, "raw.labor": 1 }).lean().exec();
  return calculateSalaryDays(keys, snapshots, cards.map(c => c.raw as unknown as HomebaseTimecard),
    timezone, businessStartTime, today);
}

export async function getSalaryCostInRange(locationId: string, range: TimeRange, context?: SalaryContext): Promise<number> {
  return (await getSalaryDaysForRange(locationId, range, context)).reduce((sum, day) => sum + day.cost, 0);
}

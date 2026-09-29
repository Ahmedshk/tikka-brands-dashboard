import type { HomebaseEmployee, HomebaseTimecard } from "../services/homebase.service.js";
import {
  businessDateKeyForInstant, businessDayUtcRangeIsoStrings,
  getBusinessHourSlotBoundsForBusinessDateKey,
} from "./businessDayUtcRange.util.js";
import { getBucketKeyForDate, type SalesTrendGranularity } from "./homebaseOrderedBuckets.util.js";

export const SALARY_REPORTING_START = "2026-09-13";
export interface SalaryRate { jobId: number; annualSalary: number }
/** A COMPLETE location salary roster, effective until the next snapshot. */
export interface SalarySnapshot { effectiveFrom: string; salaries: SalaryRate[] }
export interface SalaryDay { businessDateKey: string; cost: number }

/** Reporting policy: a full daily allocation, evenly spread over the 24 business-hour slots. */
export function addSalaryToHourlySlots(slots: number[], days: SalaryDay[]): number[] {
  const perSlot = days.reduce((sum, day) => sum + day.cost, 0) / 24;
  return Array.from({ length: 24 }, (_, index) => (slots[index] ?? 0) + perSlot);
}

export function addSalaryToBuckets(
  days: SalaryDay[], buckets: Record<string, number>, timezone: string,
  businessStartTime: string, granularity: SalesTrendGranularity,
): void {
  for (const day of days) {
    const slots = granularity === "hourly" ? 24 : 1;
    for (let slot = 0; slot < slots; slot++) {
      const range = granularity === "hourly"
        ? getBusinessHourSlotBoundsForBusinessDateKey(timezone, businessStartTime, day.businessDateKey, slot)
        : businessDayUtcRangeIsoStrings(timezone, businessStartTime, day.businessDateKey);
      const key = getBucketKeyForDate(new Date(range.startAt), timezone, granularity, { businessStartTime });
      if (Object.hasOwn(buckets, key)) buckets[key] = (buckets[key] ?? 0) + day.cost / slots;
    }
  }
}

export function salaryRatesFromEmployees(employees: HomebaseEmployee[], locationUuid: string): SalaryRate[] {
  const rates = new Map<number, SalaryRate>();
  for (const employee of employees) {
    const job = employee.job;
    if (!job || job.archived_at || job.wage_type !== "salary") continue;
    if (job.location_uuid !== locationUuid) throw new Error("Salary job location does not match sync location");
    if (!Number.isSafeInteger(job.id) || typeof job.wage_rate !== "number" ||
        !Number.isFinite(job.wage_rate) || job.wage_rate < 0) {
      throw new Error("Salary job has an invalid or missing annual wage rate");
    }
    if (rates.has(job.id)) throw new Error("Duplicate salary job in employee response");
    rates.set(job.id, { jobId: job.id, annualSalary: job.wage_rate });
  }
  return [...rates.values()].sort((a, b) => a.jobId - b.jobId);
}

/**
 * Annual / 52 / 7 is the agreed reporting assumption, not a Homebase API guarantee.
 * Never use a later roster for an earlier day. Hourly cards on a transition day
 * suppress the salary addition for that job; salary costs already on cards are
 * credited to avoid counting the same pay twice. Raw card costs are untouched.
 */
export function calculateSalaryDays(
  keys: string[], snapshots: SalarySnapshot[], cards: HomebaseTimecard[],
  timezone: string, businessStartTime: string, today: string,
): SalaryDay[] {
  const history = [...snapshots].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const cardCosts = new Map<string, { hourly: boolean; salaryCost: number }>();
  for (const card of cards) {
    if (!card.clock_in || !Number.isFinite(Date.parse(card.clock_in))) continue;
    const day = businessDateKeyForInstant(card.clock_in, timezone, businessStartTime);
    const key = `${day}:${card.job_id}`;
    const value = cardCosts.get(key) ?? { hourly: false, salaryCost: 0 };
    if (card.labor?.wage_type === "hourly") value.hourly = true;
    const cost = card.labor?.costs;
    if (card.labor?.wage_type === "salary" && typeof cost === "number" && Number.isFinite(cost)) {
      value.salaryCost += cost;
    }
    cardCosts.set(key, value);
  }
  return [...new Set(keys)].sort().filter(key => key >= SALARY_REPORTING_START && key <= today).map(key => {
    const snapshot = history.filter(row => row.effectiveFrom <= key).at(-1);
    let cost = 0;
    for (const rate of snapshot?.salaries ?? []) {
      const paid = cardCosts.get(`${key}:${rate.jobId}`);
      if (paid?.hourly) continue;
      cost += Math.max(0, rate.annualSalary / 364 - (paid?.salaryCost ?? 0));
    }
    return { businessDateKey: key, cost };
  });
}

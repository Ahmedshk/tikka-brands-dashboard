/** Change the cache key so existing totals-only entries cannot omit the breakdown. */
export const COMMAND_CENTER_KPI_BREAKDOWN_VERSION = 1;

export function withSingleLocationBreakdown(data: Record<string, unknown>, locationId: string): Record<string, unknown> {
  return { ...data, locationBreakdown: [{ locationId, kpis: data }] };
}

export function buildLocationKpiBreakdown(params: {
  locationId: string;
  periods: Period[];
  metrics: string[];
  kpisByPeriod: Partial<Record<Period, PeriodRangeKpis>>;
  laborCostGoal: number;
  laborCostGoalTolerance: number;
  reviewRating?: ReviewRatingKpiData;
}): { locationId: string; kpis: Record<string, unknown> } {
  const slices: Record<string, unknown> = {};
  for (const period of params.periods) {
    const kpis = params.kpisByPeriod[period];
    if (!kpis) continue;
    slices[period] = buildSliceForPeriod(period, params.metrics, params.metrics.includes('reviewRating'), kpis,
      params.laborCostGoal, params.laborCostGoalTolerance, params.reviewRating);
  }
  return { locationId: params.locationId, kpis: params.periods.length === 1 && params.periods[0] === 'today'
    ? (slices.today ?? {}) as Record<string, unknown> : slices };
}
import type { Period } from '../types/commandCenter.types.js';
import { buildSliceForPeriod, type PeriodRangeKpis, type ReviewRatingKpiData } from './commandCenterKpiLogic.js';

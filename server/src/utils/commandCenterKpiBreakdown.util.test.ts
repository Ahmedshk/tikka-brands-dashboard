import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocationKpiBreakdown, COMMAND_CENTER_KPI_BREAKDOWN_VERSION, withSingleLocationBreakdown } from './commandCenterKpiBreakdown.util.js';
import { buildCacheKeyFromParams } from './dashboardCacheKey.util.js';
import { PERIODS } from '../types/commandCenter.types.js';

const kpis = { netSales: 100, laborCost: 25, laborCostPercent: 25, laborCostStatus: 'green' as const };
const reviewRating = {
  todayRating: 4, todayCount: 1, yesterdayRating: 5, yesterdayCount: 2,
  weekToDateRating: 4.5, weekToDateCount: 3, monthToDateRating: 4.6, monthToDateCount: 10,
  lastWeekRating: null, lastWeekCount: 0, overallRating: 4.7, overallCount: 50,
};
const params = {
  locationId: 'a', periods: [...PERIODS], metrics: ['netSales', 'laborCost', 'reviewRating'],
  kpisByPeriod: Object.fromEntries(PERIODS.map(period => [period, kpis])),
  laborCostGoal: 30, laborCostGoalTolerance: 2, reviewRating,
};

test('breakdown carries every requested period with location-specific values and goals', () => {
  const row = buildLocationKpiBreakdown(params);
  assert.equal(row.locationId, 'a');
  assert.equal((row.kpis.weekToDate as Record<string, unknown>).netSalesWeekToDate, 100);
  assert.equal((row.kpis.monthToDate as Record<string, unknown>).laborCostMonthToDate, 25);
  assert.equal((row.kpis.yesterday as Record<string, unknown>).reviewRating, 5);
  assert.equal((row.kpis.lastWeek as Record<string, unknown>).reviewRating, null);
  assert.equal((row.kpis.today as Record<string, unknown>).laborCostGoal, 30);
  assert.deepEqual(Object.keys(row.kpis), [...PERIODS]);
});

test('breakdown filters forbidden metrics and distinguishes zero from unavailable', () => {
  const row = buildLocationKpiBreakdown({ ...params, periods: ['today'], metrics: ['netSales'],
    kpisByPeriod: { today: { ...kpis, netSales: 0, laborCost: null } } });
  assert.deepEqual(row.kpis, { netSalesToday: 0 });
  const labor = buildLocationKpiBreakdown({ ...params, periods: ['today'], metrics: ['laborCost'],
    kpisByPeriod: { today: { ...kpis, laborCost: null } } });
  assert.equal(labor.kpis.laborCostToday, null);
  assert.equal('reviewRating' in labor.kpis, false);
});

test('single-location response reuses the existing totals without recursive breakdowns', () => {
  const data = { today: { netSalesToday: 100 }, yesterday: { netSalesYesterday: 50 } };
  assert.deepEqual(withSingleLocationBreakdown(data, 'a'), {
    ...data, locationBreakdown: [{ locationId: 'a', kpis: data }],
  });
  assert.equal('locationBreakdown' in data, false);
});

test('breakdown responses cannot hit a totals-only cache entry', () => {
  const spec = { endpoint: 'command-center.kpis' as const, locationScope: 'all', params: { metrics: ['netSales'], periods: ['today'] } };
  assert.notEqual(buildCacheKeyFromParams(spec).cacheKey,
    buildCacheKeyFromParams({ ...spec, params: { ...spec.params, breakdownVersion: COMMAND_CENTER_KPI_BREAKDOWN_VERSION } }).cacheKey);
});

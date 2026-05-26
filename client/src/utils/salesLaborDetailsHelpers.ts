import type { SalesLaborKPIsData } from '../services/commandCenter.service';
import type { Goal } from '../types';
import type { TargetActualItem } from '../components/SalesLabor';
import type { PeriodPickerValue } from '../components/SalesTrend';
import { getTodayInTimezone } from '../services/goal.service';

export { formatCurrency } from './commandCenterHelpers';

function ymdToParts(ymd: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return {
    y: Number.parseInt(m[1]!, 10),
    m0: Number.parseInt(m[2]!, 10) - 1,
    d: Number.parseInt(m[3]!, 10),
  };
}

function partsToYmd(p: { y: number; m0: number; d: number }): string {
  return `${p.y}-${String(p.m0 + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function addDaysUtc(y: number, m0: number, d: number, delta: number): { y: number; m0: number; d: number } {
  const x = new Date(Date.UTC(y, m0, d + delta));
  return { y: x.getUTCFullYear(), m0: x.getUTCMonth(), d: x.getUTCDate() };
}

function weekdaySun0(ymd: string): number {
  const p = ymdToParts(ymd);
  if (!p) return 0;
  return new Date(Date.UTC(p.y, p.m0, p.d)).getUTCDay();
}

/**
 * Resolve a PeriodPickerValue to its calendar date bounds (YYYY-MM-DD in `timezone`).
 * Returns null when a custom period is missing its bounds.
 */
export function resolvePeriodDateBounds(
  value: PeriodPickerValue,
  timezone: string,
): { start: string; end: string } | null {
  const today = getTodayInTimezone(timezone || 'UTC');
  const t = ymdToParts(today);
  if (!t) return null;

  switch (value.periodType) {
    case 'today':
      return { start: today, end: today };
    case 'last7days':
      return { start: partsToYmd(addDaysUtc(t.y, t.m0, t.d, -6)), end: today };
    case 'last30days':
      return { start: partsToYmd(addDaysUtc(t.y, t.m0, t.d, -29)), end: today };
    case 'last52weeks':
      return { start: partsToYmd(addDaysUtc(t.y, t.m0, t.d, -363)), end: today };
    case 'thisWeek': {
      const dow = weekdaySun0(today);
      return { start: partsToYmd(addDaysUtc(t.y, t.m0, t.d, -dow)), end: today };
    }
    case 'thisMonth':
      return { start: partsToYmd({ y: t.y, m0: t.m0, d: 1 }), end: today };
    case 'thisYear':
      return { start: partsToYmd({ y: t.y, m0: 0, d: 1 }), end: today };
    case 'custom':
      if (!value.periodStart || !value.periodEnd) return null;
      return { start: value.periodStart, end: value.periodEnd };
    default:
      return { start: today, end: today };
  }
}

/** True when the period collapses to a single calendar day. */
export function isSingleDayPeriod(value: PeriodPickerValue, timezone: string): boolean {
  const bounds = resolvePeriodDateBounds(value, timezone);
  if (!bounds) return false;
  return bounds.start === bounds.end;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatYmdLong(ymd: string): string {
  const p = ymdToParts(ymd);
  if (!p) return ymd;
  return `${MONTH_NAMES[p.m0]} ${p.d}, ${p.y}`;
}

/**
 * Human-readable label for the selected period.
 * - "today" → "Today"
 * - single-day period → "May 23, 2026"
 * - multi-day period → "May 23, 2026 – May 26, 2026"
 */
export function getPeriodLabel(value: PeriodPickerValue, timezone: string): string {
  if (value.periodType === 'today') return 'Today';
  const bounds = resolvePeriodDateBounds(value, timezone || 'UTC');
  if (!bounds) return '—';
  const start = formatYmdLong(bounds.start);
  const end = formatYmdLong(bounds.end);
  return bounds.start === bounds.end ? start : `${start} – ${end}`;
}

type KpiFlags = {
  canKpi1: boolean;
  canKpi2: boolean;
  canKpi3: boolean;
  canKpi4: boolean;
  canKpi5: boolean;
  canKpi6: boolean;
  canKpi7: boolean;
  canKpi8: boolean;
  canSources: boolean;
  canDaily: boolean;
};

const KPI_METRIC_PAIRS: { key: keyof KpiFlags; metric: string }[] = [
  { key: 'canKpi1', metric: 'actualTotalSales' },
  { key: 'canKpi2', metric: 'actualLaborCostPercent' },
  { key: 'canKpi3', metric: 'totalHours' },
  { key: 'canKpi4', metric: 'salesPerManHour' },
  { key: 'canKpi5', metric: 'transactionCount' },
  { key: 'canKpi6', metric: 'averageCheck' },
  { key: 'canKpi7', metric: 'totalDiscounts' },
  { key: 'canKpi8', metric: 'totalRefunds' },
  { key: 'canSources', metric: 'sourcesOfSales' },
];

const DAILY_REQUIRED_METRICS = ['actualTotalSales', 'actualLaborCostPercent', 'totalHours', 'salesPerManHour'] as const;

/**
 * Returns the list of metric keys to request for Sales & Labor KPIs based on permissions.
 */
export function getSalesLaborKpiMetrics(flags: KpiFlags): string[] {
  const m = KPI_METRIC_PAIRS.filter(({ key }) => flags[key]).map(({ metric }) => metric);
  if (flags.canDaily) {
    for (const metric of DAILY_REQUIRED_METRICS) {
      if (!m.includes(metric)) m.push(metric);
    }
  }
  return [...new Set(m)];
}

/**
 * Build daily targets vs actual items for the card.
 */
export function buildDailyTargetsItems(
  kpis: SalesLaborKPIsData | null,
  goals: Goal | null
): TargetActualItem[] {
  const salesActual = kpis?.actualTotalSales ?? 0;
  const salesTarget = goals?.salesGoal ?? 0;
  const laborActual = kpis?.actualLaborCostPercent ?? 0;
  const laborTarget = goals?.laborCostGoal ?? 0;
  const hoursActual = kpis?.totalHours ?? 0;
  const hoursTarget = goals?.hoursGoal ?? 0;
  const spmhActual = kpis?.salesPerManHour ?? 0;
  const spmhTarget = goals?.spmhGoal ?? 0;
  const to2 = (n: number) => Number(n.toFixed(2));
  const fmtSales = (n: number) =>
    `$${to2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    {
      label: 'Sales Target',
      actual: salesActual,
      target: salesTarget,
      higherIsBetter: true,
      targetTolerance: goals?.salesGoalTolerance,
      goalTooltip: `Goal: Meet or Exceed ${fmtSales(salesTarget)}`,
      formatValue: fmtSales,
    },
    {
      label: 'Labor Cost %',
      actual: laborActual,
      target: laborTarget,
      higherIsBetter: false,
      targetTolerance: goals?.laborCostGoalTolerance,
      goalTooltip: `Goal: Stay at or below ${to2(laborTarget)}%`,
      formatValue: (n: number) => `${to2(n)}%`,
    },
    {
      label: 'Hours Target',
      actual: hoursActual,
      target: hoursTarget,
      higherIsBetter: false,
      targetTolerance: goals?.hoursGoalTolerance,
      goalTooltip: `Goal: Stay at or below ${to2(hoursTarget)} hrs`,
      formatValue: (n: number) => String(to2(n)),
    },
    {
      label: 'SPMH Target',
      actual: spmhActual,
      target: spmhTarget,
      higherIsBetter: true,
      targetTolerance: goals?.spmhGoalTolerance,
      goalTooltip: `Goal: Meet or Exceed $${to2(spmhTarget).toFixed(2)}/hr`,
      formatValue: (n: number) => `$${to2(n).toFixed(2)}/hr`,
    },
  ];
}

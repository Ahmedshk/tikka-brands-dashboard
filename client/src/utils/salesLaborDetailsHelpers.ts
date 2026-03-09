import type { SalesLaborKPIsData } from '../services/commandCenter.service';
import type { Goal } from '../types';
import type { TargetActualItem } from '../components/SalesLabor';

export { formatCurrency } from './commandCenterHelpers';

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

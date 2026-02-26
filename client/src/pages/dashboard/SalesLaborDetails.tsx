import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import {
  SalesLaborKPICards,
  HourlyBreakdownCard,
  SourcesOfSalesCard,
  ClockedInStaffCard,
  DailyTargetsSectionCard,
} from '../../components/SalesLabor';
import type { SalesLaborKPIItem, TargetActualItem } from '../../components/SalesLabor';
import SalesAndLaborIcon from '@assets/icons/sales_and_labor.svg?react';
import DollarIcon from '@assets/icons/dollar.svg?react';
import ActualLaborCostIcon from '@assets/icons/actual_labor_cost.svg?react';
import TotalHoursIcon from '@assets/icons/total_hours.svg?react';
import SalesPerManHourIcon from '@assets/icons/sales_per_man_hour.svg?react';
import NoOfTransactionsIcon from '@assets/icons/no_of_transactions.svg?react';
import AverageCheckIcon from '@assets/icons/average_check.svg?react';
import TotalDiscountsIcon from '@assets/icons/total_discounts.svg?react';
import {
  commandCenterService,
  type SalesLaborKPIsData,
  type HourlyBreakdownData,
} from '../../services/commandCenter.service';
import { goalService } from '../../services/goal.service';
import type { Goal } from '../../types';
import type { RootState } from '../../store/store';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';

const PAGE_ID = 'sales-labor-detail';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const clockedInStaffRows = [
  { name: 'Alex Jonson', role: 'Line Cook', clockIn: '10:00 am', currentHours: 6.5, status: 'On Clock' as const },
  { name: 'Kraven meachle', role: 'Prep Cook', clockIn: '8:00 am', currentHours: 6.5, status: 'On Break' as const },
  { name: 'Sarah Miller', role: 'Server', clockIn: '9:30 am', currentHours: 5, status: 'On Clock' as const },
  { name: 'James Wilson', role: 'Line Cook', clockIn: '11:00 am', currentHours: 4, status: 'On Clock' as const },
  { name: 'Emma Davis', role: 'Prep Cook', clockIn: '7:00 am', currentHours: 8, status: 'On Break' as const },
];

export const SalesLaborDetails = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const canKpi1 = useCanAccessComponent(PAGE_ID, 'kpi-actual-total-net-sales');
  const canKpi2 = useCanAccessComponent(PAGE_ID, 'kpi-actual-labor-cost');
  const canKpi3 = useCanAccessComponent(PAGE_ID, 'kpi-total-hours');
  const canKpi4 = useCanAccessComponent(PAGE_ID, 'kpi-sales-per-man-hour');
  const canKpi5 = useCanAccessComponent(PAGE_ID, 'kpi-no-of-transactions');
  const canKpi6 = useCanAccessComponent(PAGE_ID, 'kpi-average-check');
  const canKpi7 = useCanAccessComponent(PAGE_ID, 'kpi-total-discounts');
  const canKpi8 = useCanAccessComponent(PAGE_ID, 'kpi-total-refunds');
  const canHourly = useCanAccessComponent(PAGE_ID, 'hourly-breakdown');
  const canSources = useCanAccessComponent(PAGE_ID, 'sources-of-sales');
  const canStaff = useCanAccessComponent(PAGE_ID, 'staff-timesheet');
  const canDaily = useCanAccessComponent(PAGE_ID, 'daily-targets-vs-actual');

  const shouldFetch =
    canKpi1 || canKpi2 || canKpi3 || canKpi4 || canKpi5 || canKpi6 || canKpi7 || canKpi8 ||
    canHourly || canSources || canStaff || canDaily;

  const kpiMetrics = useMemo(() => {
    const m: string[] = [];
    if (canKpi1) m.push('actualTotalSales');
    if (canKpi2) m.push('actualLaborCostPercent');
    if (canKpi3) m.push('totalHours');
    if (canKpi4) m.push('salesPerManHour');
    if (canKpi5) m.push('transactionCount');
    if (canKpi6) m.push('averageCheck');
    if (canKpi7) m.push('totalDiscounts');
    if (canKpi8) m.push('totalRefunds');
    if (canSources) m.push('sourcesOfSales');
    if (canDaily) {
      if (!m.includes('actualTotalSales')) m.push('actualTotalSales');
      if (!m.includes('actualLaborCostPercent')) m.push('actualLaborCostPercent');
      if (!m.includes('totalHours')) m.push('totalHours');
      if (!m.includes('salesPerManHour')) m.push('salesPerManHour');
    }
    return [...new Set(m)];
  }, [canKpi1, canKpi2, canKpi3, canKpi4, canKpi5, canKpi6, canKpi7, canKpi8, canSources, canDaily]);

  const [kpis, setKpis] = useState<SalesLaborKPIsData | null>(null);
  const [hourlyBreakdown, setHourlyBreakdown] = useState<HourlyBreakdownData | null>(null);
  const [goals, setGoals] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentLocation?._id || !shouldFetch) {
      setKpis(null);
      setHourlyBreakdown(null);
      setGoals(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const locationId = currentLocation._id;
    const promises: Promise<unknown>[] = [];
    if (kpiMetrics.length > 0) {
      promises.push(commandCenterService.getSalesLaborKPIs(locationId, { metrics: kpiMetrics }));
    } else {
      promises.push(Promise.resolve(null));
    }
    if (canHourly) {
      promises.push(commandCenterService.getHourlyBreakdown(locationId));
    } else {
      promises.push(Promise.resolve(null));
    }
    if (canDaily) {
      promises.push(goalService.getByLocationId(locationId).catch(() => null));
    } else {
      promises.push(Promise.resolve(null));
    }
    Promise.all(promises)
      .then(([kpisData, hourlyData, goalsData]) => {
        setKpis((kpisData as SalesLaborKPIsData) ?? null);
        setHourlyBreakdown((hourlyData as HourlyBreakdownData) ?? null);
        setGoals((goalsData as Goal | null) ?? null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load Sales & Labor data');
        setKpis(null);
        setHourlyBreakdown(null);
        setGoals(null);
      })
      .finally(() => setLoading(false));
  }, [currentLocation?._id, shouldFetch, canHourly, canDaily, kpiMetrics.join(',')]);

  const salesLaborKPIs = useMemo((): SalesLaborKPIItem[] => {
    const unavail = '—';
    const fmt = (n: number | null, asCurrency: boolean) =>
      n == null ? unavail : asCurrency ? formatCurrency(n) : String(n);
    const fmtPercent = (n: number | null) => (n == null ? unavail : `${Number(n.toFixed(1))}%`);
    const fmtWhole = (n: number | null) => (n == null ? unavail : String(Math.round(n)));
    const fmtHours = (n: number | null) => (n == null ? unavail : Number(n).toFixed(2));
    const items: SalesLaborKPIItem[] = [];
    if (canKpi1) items.push({ title: 'Actual Total Net Sales', timePeriod: 'Today', value: fmt(kpis?.actualTotalSales ?? null, true), accentColor: 'green', rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />, loading });
    if (canKpi2) items.push({ title: 'Actual Labor Cost %', timePeriod: 'Today', value: fmtPercent(kpis?.actualLaborCostPercent ?? null), accentColor: 'blue', rightIcon: <ActualLaborCostIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />, loading });
    if (canKpi3) items.push({ title: 'Total Hours', timePeriod: 'Today', value: fmtHours(kpis?.totalHours ?? null), accentColor: 'orange', rightIcon: <TotalHoursIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />, loading });
    if (canKpi4) items.push({ title: 'Sales Per Man Hour', timePeriod: 'Today', value: fmt(kpis?.salesPerManHour ?? null, true), accentColor: 'purple', rightIcon: <SalesPerManHourIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />, loading });
    if (canKpi5) items.push({ title: 'No. of Transactions', timePeriod: 'Today', value: fmtWhole(kpis?.transactionCount ?? null), accentColor: 'gray', rightIcon: <NoOfTransactionsIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />, loading });
    if (canKpi6) items.push({ title: 'Average Check', timePeriod: 'Today', value: fmt(kpis?.averageCheck ?? null, true), accentColor: 'red', rightIcon: <AverageCheckIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />, loading });
    if (canKpi7) items.push({ title: 'Total Discounts', timePeriod: 'Today', value: fmt(kpis?.totalDiscounts ?? null, true), accentColor: 'azure', rightIcon: <TotalDiscountsIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />, loading });
    if (canKpi8) items.push({ title: 'Total Refunds', timePeriod: 'Today', value: fmt(kpis?.totalRefunds ?? null, true), accentColor: 'yellow', subtitle: '#Refunds', extra: typeof kpis?.totalRefundCount === 'number' ? String(kpis.totalRefundCount).padStart(2, '0') : undefined, extraClassName: 'bg-quaternary/20 text-primary', loading });
    return items;
  }, [kpis, loading, canKpi1, canKpi2, canKpi3, canKpi4, canKpi5, canKpi6, canKpi7, canKpi8]);

  const dailyTargetsItems = useMemo((): TargetActualItem[] => {
    const salesActual = kpis?.actualTotalSales ?? 0;
    const salesTarget = goals?.salesGoal ?? 0;
    const laborActual = kpis?.actualLaborCostPercent ?? 0;
    const laborTarget = goals?.laborCostGoal ?? 0;
    const hoursActual = kpis?.totalHours ?? 0;
    const hoursTarget = goals?.hoursGoal ?? 0;
    const spmhActual = kpis?.salesPerManHour ?? 0;
    const spmhTarget = goals?.spmhGoal ?? 0;
    const to2 = (n: number) => Number(n.toFixed(2));
    return [
      {
        label: 'Sales Target',
        actual: salesActual,
        target: salesTarget,
        higherIsBetter: true,
        formatValue: (n: number) =>
          `$${to2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      {
        label: 'Labor Cost %',
        actual: laborActual,
        target: laborTarget,
        higherIsBetter: false,
        formatValue: (n: number) => `${to2(n)}%`,
      },
      {
        label: 'Hours Target',
        actual: hoursActual,
        target: hoursTarget,
        higherIsBetter: false,
        formatValue: (n: number) => String(to2(n)),
      },
      {
        label: 'SPMH Target',
        actual: spmhActual,
        target: spmhTarget,
        higherIsBetter: true,
        formatValue: (n: number) => `$${to2(n).toFixed(2)}`,
      },
    ];
  }, [kpis, goals]);

  return (
    <Layout>
      <div className="p-6 min-h-[200px]">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <SalesAndLaborIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Sales & Labor Detail
          </h2>
        </div>

        {!currentLocation && (
          <p className="text-sm text-secondary mb-4">Select a location from the navbar to view Sales & Labor data.</p>
        )}
        {error && (
          <p className="text-sm text-negative mb-4" role="alert">{error}</p>
        )}

        {salesLaborKPIs.length > 0 && <SalesLaborKPICards items={salesLaborKPIs} />}

        {(canHourly || canSources) && (
          <div
            className={
              canHourly && canSources
                ? 'grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6'
                : 'grid grid-cols-1 gap-6 mb-6'
            }
          >
            {canHourly && (
              <HourlyBreakdownCard
                xAxisLabels={hourlyBreakdown?.labels ?? []}
                salesData={hourlyBreakdown?.netSalesPerHour ?? []}
                laborCostData={
                  hourlyBreakdown?.laborCostPercentPerHour?.map((p) => p ?? 0) ?? []
                }
                height={280}
                className={canSources ? 'lg:col-span-2' : ''}
                loading={loading}
              />
            )}
            {canSources && (
              <SourcesOfSalesCard
                totalSales={
                  kpis?.actualTotalSales != null
                    ? formatCurrency(kpis.actualTotalSales)
                    : '—'
                }
                segments={kpis?.sourcesOfSales ?? []}
                subtitle="Today"
                loading={loading}
              />
            )}
          </div>
        )}

        {(canStaff || canDaily) && (
          <div
            className={
              canStaff && canDaily
                ? 'grid grid-cols-1 lg:grid-cols-3 gap-6'
                : 'grid grid-cols-1 gap-6'
            }
          >
            {canStaff && (
              <ClockedInStaffCard
                rows={clockedInStaffRows}
                className={canDaily ? 'lg:col-span-2' : ''}
              />
            )}
            {canDaily && <DailyTargetsSectionCard items={dailyTargetsItems} loading={loading} />}
          </div>
        )}
      </div>
    </Layout>
  );
};

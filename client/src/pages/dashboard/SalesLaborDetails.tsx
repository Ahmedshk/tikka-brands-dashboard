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
// Period selector is temporarily hidden in JSX while the rollup backfill runs.
// To re-enable: add `PeriodPicker` back to this import, change `useState<PeriodPickerValue>`
// below back to `const [period, setPeriod] = ...`, and uncomment the picker block in JSX.
// import { PeriodPicker, type PeriodPickerValue } from '../../components/SalesTrend';
import { type PeriodPickerValue } from '../../components/SalesTrend';
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
  type TimesheetRow,
} from '../../services/commandCenter.service';
import { goalService } from '../../services/goal.service';
import type { Goal } from '../../types';
import type { RootState } from '../../store/store';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import {
  formatCurrency,
  getSalesLaborKpiMetrics,
  buildDailyTargetsItems,
  resolvePeriodDateBounds,
  isSingleDayPeriod,
} from '../../utils/salesLaborDetailsHelpers';
import { buildSalesLaborKPIItems } from '../../utils/salesLaborKpiBuilder';

const PAGE_ID = 'sales-labor-detail';

const defaultPeriod: PeriodPickerValue = { periodType: 'today' };

export const SalesLaborDetails = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const allLocationsSelected = useSelector((state: RootState) => state.location.allLocationsSelected);
  const locationId = allLocationsSelected ? '__all__' : (currentLocation?._id ?? null);
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

  // Picker is hidden — state stays so every downstream effect/API call keeps working
  // against the default ("today") period. Restore the `setPeriod` setter when the picker
  // is re-enabled (see comment near the JSX block below).
  const [period] = useState<PeriodPickerValue>(defaultPeriod);

  const kpiMetrics = useMemo(
    () =>
      getSalesLaborKpiMetrics({
        canKpi1,
        canKpi2,
        canKpi3,
        canKpi4,
        canKpi5,
        canKpi6,
        canKpi7,
        canKpi8,
        canSources,
        canDaily,
      }),
    [canKpi1, canKpi2, canKpi3, canKpi4, canKpi5, canKpi6, canKpi7, canKpi8, canSources, canDaily]
  );

  const [kpis, setKpis] = useState<SalesLaborKPIsData | null>(null);
  const [hourlyBreakdown, setHourlyBreakdown] = useState<HourlyBreakdownData | null>(null);
  const [goals, setGoals] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(!!locationId && shouldFetch);
  const [error, setError] = useState<string | null>(null);
  const [timesheetRows, setTimesheetRows] = useState<TimesheetRow[]>([]);
  const [timesheetLoading, setTimesheetLoading] = useState(!!locationId && canStaff);

  const periodIsCustomIncomplete =
    period.periodType === 'custom' && (!period.periodStart || !period.periodEnd);

  useEffect(() => {
    if (!locationId || !shouldFetch || periodIsCustomIncomplete) {
      setKpis(null);
      setHourlyBreakdown(null);
      setGoals(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const periodOptions = {
      periodType: period.periodType,
      ...(period.periodType === 'custom' && period.periodStart && period.periodEnd
        ? { periodStart: period.periodStart, periodEnd: period.periodEnd }
        : {}),
    };
    const promises: Promise<unknown>[] = [];
    if (kpiMetrics.length > 0) {
      promises.push(
        commandCenterService.getSalesLaborKPIs(locationId, {
          metrics: kpiMetrics,
          ...periodOptions,
          signal: controller.signal,
        }),
      );
    } else {
      promises.push(Promise.resolve(null));
    }
    if (canHourly) {
      promises.push(
        commandCenterService.getHourlyBreakdown(locationId, {
          ...periodOptions,
          signal: controller.signal,
        }),
      );
    } else {
      promises.push(Promise.resolve(null));
    }
    if (canDaily) {
      const tz = currentLocation?.timezone ?? 'UTC';
      const bounds = resolvePeriodDateBounds(period, tz);
      if (bounds) {
        if (bounds.start === bounds.end) {
          promises.push(
            goalService.getResolved(locationId, bounds.start, { signal: controller.signal }).catch((err) => {
              if (controller.signal.aborted) throw err;
              return null;
            }),
          );
        } else {
          promises.push(
            goalService
              .getResolvedRange(locationId, bounds.start, bounds.end, { signal: controller.signal })
              .catch((err) => {
                if (controller.signal.aborted) throw err;
                return null;
              }),
          );
        }
      } else {
        promises.push(Promise.resolve(null));
      }
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
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load Sales & Labor data');
        setKpis(null);
        setHourlyBreakdown(null);
        setGoals(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    locationId,
    shouldFetch,
    canHourly,
    canDaily,
    kpiMetrics.join(','),
    period.periodType,
    period.periodStart,
    period.periodEnd,
    periodIsCustomIncomplete,
    currentLocation?.timezone,
  ]);

  useEffect(() => {
    if (!locationId || !canStaff || periodIsCustomIncomplete) {
      setTimesheetRows([]);
      setTimesheetLoading(false);
      return;
    }
    const controller = new AbortController();
    setTimesheetLoading(true);
    const periodOptions = {
      periodType: period.periodType,
      ...(period.periodType === 'custom' && period.periodStart && period.periodEnd
        ? { periodStart: period.periodStart, periodEnd: period.periodEnd }
        : {}),
    };
    commandCenterService
      .getTimesheet(locationId, { ...periodOptions, signal: controller.signal })
      .then(setTimesheetRows)
      .catch(() => {
        if (!controller.signal.aborted) setTimesheetRows([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTimesheetLoading(false);
      });
    return () => controller.abort();
  }, [
    locationId,
    canStaff,
    period.periodType,
    period.periodStart,
    period.periodEnd,
    periodIsCustomIncomplete,
  ]);

  const salesLaborKPIs = useMemo(
    () =>
      buildSalesLaborKPIItems({
        kpis,
        loading,
        canKpi1,
        canKpi2,
        canKpi3,
        canKpi4,
        canKpi5,
        canKpi6,
        canKpi7,
        canKpi8,
        icons: {
          dollar: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          actualLaborCost: <ActualLaborCostIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          totalHours: <TotalHoursIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          salesPerManHour: <SalesPerManHourIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          noOfTransactions: <NoOfTransactionsIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          averageCheck: <AverageCheckIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          totalDiscounts: <TotalDiscountsIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
          totalRefunds: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        },
      }),
    [kpis, loading, canKpi1, canKpi2, canKpi3, canKpi4, canKpi5, canKpi6, canKpi7, canKpi8]
  );

  const dailyTargetsItems = useMemo(
    () => buildDailyTargetsItems(kpis, goals),
    [kpis, goals]
  );

  const sourcesSubtitle = useMemo(() => {
    const tz = currentLocation?.timezone ?? 'UTC';
    if (isSingleDayPeriod(period, tz)) return 'Today';
    return 'Selected period';
  }, [period.periodType, period.periodStart, period.periodEnd, currentLocation?.timezone]);

  const dailyTargetsSuffix = useMemo(() => {
    const tz = currentLocation?.timezone ?? 'UTC';
    const singleDay = isSingleDayPeriod(period, tz);
    if (allLocationsSelected) {
      return singleDay ? '(Avg goal)' : '(Avg goal, period total)';
    }
    return singleDay ? undefined : '(Period total)';
  }, [allLocationsSelected, period.periodType, period.periodStart, period.periodEnd, currentLocation?.timezone]);

  return (
    <Layout>
      <div className="p-6 min-h-[200px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <SalesAndLaborIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Sales & Labor Detail
          </h2>
          {/*
            TEMPORARILY HIDDEN: Period selector is wired end-to-end (state, API
            calls, server endpoints, goal aggregation) but multi-day periods
            depend on backfilled Square hourly + Homebase hourly + Square
            period rollups. The backfill scripts (rollup-square-orders-hourly,
            rollup-homebase-timecards-hourly, rollup-square-order-periods) are
            still running and will take a few hours to complete. Until they
            finish, selecting anything other than "Today" would still scan raw
            orders/timecards across all locations and hit gateway timeouts.

            The default `period` state ({ periodType: 'today' }) keeps the page
            on today's data — identical to the pre-period-selector behavior —
            so nothing else needs to change to hide the UI.

            To re-enable once the backfills complete: just uncomment the
            <div> block below. Everything else already works.
          */}
          {/*
          <div className="flex items-center gap-2">
            <label htmlFor="sales-labor-period" className="text-xs md:text-sm text-secondary">
              Period:
            </label>
            <PeriodPicker
              id="sales-labor-period"
              value={period}
              onChange={setPeriod}
            />
          </div>
          */}
        </div>

        {!locationId && (
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
                height={380}
                className={canSources ? 'lg:col-span-2' : ''}
                loading={loading}
              />
            )}
            {canSources && (
              <SourcesOfSalesCard
                totalSales={
                  kpis?.actualTotalSales == null
                    ? '—'
                    : formatCurrency(kpis.actualTotalSales)
                }
                segments={kpis?.sourcesOfSales ?? []}
                subtitle={sourcesSubtitle}
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
                rows={timesheetRows}
                loading={timesheetLoading}
                className={canDaily ? 'lg:col-span-2' : ''}
              />
            )}
            {canDaily && (
              <DailyTargetsSectionCard
                items={dailyTargetsItems}
                loading={loading}
                titleSuffix={dailyTargetsSuffix}
              />
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

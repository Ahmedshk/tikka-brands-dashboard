import { useCallback, useEffect, useState, useMemo } from 'react';
import { Layout } from '../../components/common/Layout';
import {
  CommandCenterKPICards,
  HourlySalesChartCard,
  LaborCostGaugeCard,
  AlertsCard,
  financialAlertsIcon,
  inventoryAlertsIcon,
  reputationAlertsIcon,
  type AlertCategory,
  type AlertItem,
  type CommandCenterKPIItem,
  type CommandCenterKPIPeriod,
} from '../../components/CommandCenter';
import CommandCenterIcon from '@assets/icons/command_center.svg?react';
import DollarIcon from '@assets/icons/dollar.svg?react';
import LaborCostIcon from '@assets/icons/actual_labor_cost.svg?react';
import StarIcon from '@assets/icons/star.svg?react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import {
  commandCenterService,
  type HourlySalesRow,
  isCommandCenterKPIsDual,
} from '../../services/commandCenter.service';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import { formatCurrency, formatHourToAmPm } from '../../utils/commandCenterHelpers';
import { buildCommandCenterKPIItems } from '../../utils/commandCenterKpiBuilder';
import type { CommandCenterAlertBuckets, CommandCenterAlertRow } from '../../types/alertNotification.types';

const PAGE_ID = 'command-center';

export const CommandCenter = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const canNetSales = useCanAccessComponent(PAGE_ID, 'net-sales-kpi');
  const canLaborCost = useCanAccessComponent(PAGE_ID, 'labor-cost-kpi');
  const canReviewRating = useCanAccessComponent(PAGE_ID, 'review-rating-kpi');
  const canHourlyChart = useCanAccessComponent(PAGE_ID, 'hourly-net-sales-chart');
  const canLaborGauge = useCanAccessComponent(PAGE_ID, 'labor-cost-percentage-gauge');
  const canAlertsFinancial = useCanAccessComponent(PAGE_ID, 'alerts-financial-labor');
  const canAlertsInventory = useCanAccessComponent(PAGE_ID, 'alerts-inventory-supply-chain');
  const canAlertsReputation = useCanAccessComponent(PAGE_ID, 'alerts-reputation-hr');

  const shouldFetchKpis = canNetSales || canLaborCost || canReviewRating || canLaborGauge;
  const kpiMetrics = useMemo(() => {
    const m: string[] = [];
    if (canNetSales || canLaborGauge) m.push("netSales");
    if (canLaborCost || canLaborGauge) m.push("laborCost");
    if (canReviewRating) m.push("reviewRating");
    return [...new Set(m)];
  }, [canNetSales, canLaborCost, canReviewRating, canLaborGauge]);
  const shouldFetchHourly = canHourlyChart;
  const showAlerts = canAlertsFinancial || canAlertsInventory || canAlertsReputation;

  const [kpis, setKpis] = useState<Awaited<ReturnType<typeof commandCenterService.getKPIs>> | null>(null);
  const [loading, setLoading] = useState(!!currentLocation?._id && shouldFetchKpis);
  const [error, setError] = useState<string | null>(null);
  const [netSalesPeriod, setNetSalesPeriod] = useState<CommandCenterKPIPeriod>('today');
  const [laborCostPeriod, setLaborCostPeriod] = useState<CommandCenterKPIPeriod>('today');
  const [reviewRatingPeriod, setReviewRatingPeriod] = useState<CommandCenterKPIPeriod>('today');
  const [hourlySales, setHourlySales] = useState<HourlySalesRow[] | null>(null);
  const [hourlySalesLoading, setHourlySalesLoading] = useState(!!currentLocation?._id && shouldFetchHourly);
  const [hourlySalesError, setHourlySalesError] = useState<string | null>(null);
  const [alertBuckets, setAlertBuckets] = useState<CommandCenterAlertBuckets | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentLocation?._id || !shouldFetchKpis || kpiMetrics.length === 0) {
      setKpis(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    commandCenterService
      .getKPIs(currentLocation._id, {
        metrics: kpiMetrics,
        periods: ['today', 'weekToDate'],
        signal: controller.signal,
      })
      .then(setKpis)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load KPIs");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [currentLocation?._id, shouldFetchKpis, kpiMetrics.join(",")]);

  useEffect(() => {
    if (!currentLocation?._id || !shouldFetchHourly) {
      setHourlySales(null);
      setHourlySalesError(null);
      setHourlySalesLoading(false);
      return;
    }
    const controller = new AbortController();
    setHourlySalesLoading(true);
    setHourlySalesError(null);
    commandCenterService
      .getHourlySales(currentLocation._id, { signal: controller.signal })
      .then(setHourlySales)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setHourlySalesError(err instanceof Error ? err.message : 'Failed to load hourly sales');
        setHourlySales(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHourlySalesLoading(false);
      });
    return () => controller.abort();
  }, [currentLocation?._id, shouldFetchHourly]);

  useEffect(() => {
    if (!currentLocation?._id || !showAlerts) {
      setAlertBuckets(null);
      setAlertsError(null);
      setAlertsLoading(false);
      return;
    }
    const controller = new AbortController();
    setAlertsLoading(true);
    setAlertsError(null);
    commandCenterService
      .getAlerts(currentLocation._id, { signal: controller.signal })
      .then(setAlertBuckets)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setAlertsError(err instanceof Error ? err.message : 'Failed to load alerts');
        setAlertBuckets(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAlertsLoading(false);
      });
    return () => controller.abort();
  }, [currentLocation?._id, showAlerts]);

  const handleDismissAlert = useCallback(async (notificationId: string) => {
    try {
      await commandCenterService.dismissAlerts([notificationId]);
      setAlertBuckets((prev) => {
        if (prev == null) return prev;
        const without = (rows: CommandCenterAlertRow[]) =>
          rows.filter((r) => r.id !== notificationId);
        return {
          financial_labor: without(prev.financial_labor),
          inventory_supply_chain: without(prev.inventory_supply_chain),
          reputation_hr: without(prev.reputation_hr),
        };
      });
    } catch {
      setAlertsError('Could not dismiss alert. Try again.');
    }
  }, []);

  const commandCenterKPIs = useMemo((): CommandCenterKPIItem[] => {
    return buildCommandCenterKPIItems({
      kpis,
      loading,
      canNetSales,
      canLaborCost,
      canReviewRating,
      netSalesPeriod,
      laborCostPeriod,
      reviewRatingPeriod,
      setNetSalesPeriod,
      setLaborCostPeriod,
      setReviewRatingPeriod,
      icons: {
        dollar: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        laborCost: <LaborCostIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        starTitle: <StarIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-quaternary" aria-hidden />,
        starSubtitle: <StarIcon className="w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5 text-quaternary" aria-hidden />,
      },
    });
  }, [
    kpis,
    loading,
    canNetSales,
    canLaborCost,
    canReviewRating,
    netSalesPeriod,
    laborCostPeriod,
    reviewRatingPeriod,
  ]);

  const hourlyChartData = useMemo(() => {
    if (hourlySales && hourlySales.length > 0) {
      const todayTotal = hourlySales.reduce((sum, r) => sum + (r.today ?? 0), 0);
      const lastWeekTotal = hourlySales.reduce((sum, r) => sum + r.last_week, 0);
      let percentChange: number | null;
      if (lastWeekTotal === 0 && todayTotal === 0) {
        percentChange = 0;
      } else if (lastWeekTotal === 0) {
        percentChange = null;
      } else {
        percentChange = ((todayTotal - lastWeekTotal) / lastWeekTotal) * 100;
      }
      return {
        xAxisData: hourlySales.map((r) => formatHourToAmPm(r.hour)),
        series: [
          { id: 'lastWeek', label: 'Last Week', data: hourlySales.map((r) => r.last_week) },
          { id: 'today', label: 'Today', data: hourlySales.map((r) => r.today) },
        ],
        todayTotal,
        lastWeekTotal,
        percentChange,
      };
    }
    const emptyHours = Array.from({ length: 24 }, (_, h) =>
      formatHourToAmPm(`${String(h).padStart(2, '0')}:00`)
    );
    return {
      xAxisData: emptyHours,
      series: [
        { id: 'lastWeek', label: 'Last Week', data: emptyHours.map(() => 0) },
        { id: 'today', label: 'Today', data: emptyHours.map(() => null) },
      ],
      todayTotal: 0,
      lastWeekTotal: 0,
      percentChange: null,
    };
  }, [hourlySales]);

  const alertCategories = useMemo((): AlertCategory[] => {
    const rowToItem = (row: CommandCenterAlertRow): AlertItem => ({
      id: row.id,
      text:
        row.message.trim().length > 0 ? `${row.title}: ${row.message}` : row.title,
      subtitle: new Date(row.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      severity: row.severity,
      dismissable: row.dismissable,
    });

    const cats: AlertCategory[] = [];
    if (canAlertsFinancial) {
      cats.push({
        id: 'financial_labor',
        title: 'Financial & Labor',
        icon: financialAlertsIcon,
        alerts: alertBuckets?.financial_labor.map(rowToItem) ?? [],
      });
    }
    if (canAlertsInventory) {
      cats.push({
        id: 'inventory_supply_chain',
        title: 'Inventory & Supply Chain',
        icon: inventoryAlertsIcon,
        alerts: alertBuckets?.inventory_supply_chain.map(rowToItem) ?? [],
      });
    }
    if (canAlertsReputation) {
      const dynamic = alertBuckets?.reputation_hr.map(rowToItem) ?? [];
      const staticPlaceholders: AlertItem[] = [
        {
          id: 'placeholder-review-thresholds',
          text: 'Review and rating thresholds are not yet available.',
          severity: 'warning',
        },
      ];
      cats.push({
        id: 'reputation_hr',
        title: 'Reputation & HR',
        icon: reputationAlertsIcon,
        alerts: [...dynamic, ...staticPlaceholders],
      });
    }
    return cats;
  }, [
    alertBuckets,
    canAlertsFinancial,
    canAlertsInventory,
    canAlertsReputation,
  ]);

  return (
    <Layout>
      <div className="p-6 min-h-[200px]">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <CommandCenterIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Command Center
          </h2>
        </div>

        {!currentLocation && (
          <p className="text-sm text-secondary mb-4">Select a location from the navbar to view KPIs.</p>
        )}
        {error && (
          <p className="text-sm text-negative mb-4" role="alert">{error}</p>
        )}

        {commandCenterKPIs.length > 0 && (
          <CommandCenterKPICards items={commandCenterKPIs} />
        )}

        {(canHourlyChart || canLaborGauge) && (
          <div
            className={
              canHourlyChart && canLaborGauge
                ? 'grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6'
                : 'grid grid-cols-1 gap-6 mb-6'
            }
          >
            {canHourlyChart && (
              <HourlySalesChartCard
                xAxisData={hourlyChartData.xAxisData}
                series={hourlyChartData.series}
                todayTotal={hourlyChartData.todayTotal}
                lastWeekTotal={hourlyChartData.lastWeekTotal}
                percentChange={hourlyChartData.percentChange}
                valueFormatter={formatCurrency}
                height={256}
                className={canLaborGauge ? 'lg:col-span-2' : ''}
                yAxis={{ valueFormatter: (v) => formatCurrency(Number(v)) }}
                loading={hourlySalesLoading}
                error={hourlySalesError}
              />
            )}
            {canLaborGauge && (() => {
              const gaugeToday =
                kpis != null && isCommandCenterKPIsDual(kpis) ? kpis.today : kpis;
              const pct = gaugeToday?.laborCostPercentToday ?? 0;
              const goal = gaugeToday?.laborCostGoal ?? null;
              const goalTolerance = gaugeToday?.laborCostGoalTolerance ?? null;
              const overTarget =
                gaugeToday?.laborCostPercentToday != null && gaugeToday?.laborCostGoal != null
                  ? gaugeToday.laborCostPercentToday - gaugeToday.laborCostGoal
                  : null;
              return (
                <LaborCostGaugeCard
                  value={pct}
                  goal={goal}
                  goalTolerance={goalTolerance}
                  subtitle="Labor Cost as % of Net Sales"
                  overTarget={overTarget}
                  size={340}
                />
              );
            })()}
          </div>
        )}

        {showAlerts && alertCategories.length > 0 && (
          <AlertsCard
            categories={alertCategories}
            loading={alertsLoading}
            error={alertsError}
            onDismiss={handleDismissAlert}
          />
        )}
      </div>
    </Layout>
  );
};

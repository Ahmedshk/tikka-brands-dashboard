import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '../../components/CommandCenter';
import { Dropdown } from '../../components/common/Dropdown';
import { CommandCenterAlertsHistoryModal } from '../../components/CommandCenter/CommandCenterAlertsHistoryModal';
import CommandCenterIcon from '@assets/icons/command_center.svg?react';
import DollarIcon from '@assets/icons/dollar.svg?react';
import LaborCostIcon from '@assets/icons/actual_labor_cost.svg?react';
import StarIcon from '@assets/icons/star.svg?react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import {
  commandCenterService,
  type HourlySalesRow,
  isCommandCenterKPIsMulti,
} from '../../services/commandCenter.service';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import { formatCurrency, formatHourToAmPm } from '../../utils/commandCenterHelpers';
import { buildCurrencyAxisFormatter } from '../../utils/chartAxis.util';
import { buildCommandCenterKPIItems } from '../../utils/commandCenterKpiBuilder';
import {
  COMMAND_CENTER_KPI_PERIOD_OPTIONS,
  type CommandCenterKPIPeriod,
} from '../../utils/commandCenterKpiPeriodHelpers';
import { REVIEW_RATING_KPI_SUBTITLE_STAR_CLASS } from '../../utils/reviewRatingDisplayHelpers';
import { commandCenterAlertRowToAlertItem } from '../../utils/commandCenterAlertRowToAlertItem.util';
import {
  tryCommandCenterRowFromNotificationNew,
  type NotificationNewPayload,
} from '../../utils/commandCenterAlertFromNotification.util';
import { getTodayInTimezone } from '../../services/goal.service';
import { getSocket } from '../../services/socket.service';
import type {
  AlertRoleBindingCategory,
  CommandCenterAlertBuckets,
} from '../../types/alertNotification.types';

const PAGE_ID = 'command-center';

const ALERT_HISTORY_CATEGORY_TITLE: Record<AlertRoleBindingCategory, string> = {
  financial_labor: 'Financial & Labor',
  inventory_supply_chain: 'Inventory & Supply Chain',
  reputation_hr: 'Reputation & HR',
};

function sortAlertItemsNewestFirst<T extends { createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    return bt - at;
  });
}

export const CommandCenter = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const allLocationsSelected = useSelector((state: RootState) => state.location.allLocationsSelected);
  const locationId = allLocationsSelected ? '__all__' : (currentLocation?._id ?? null);
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
  const [kpiPeriod, setKpiPeriod] = useState<CommandCenterKPIPeriod>('today');
  const [hourlySales, setHourlySales] = useState<HourlySalesRow[] | null>(null);
  const [hourlySalesLoading, setHourlySalesLoading] = useState(!!currentLocation?._id && shouldFetchHourly);
  const [hourlySalesError, setHourlySalesError] = useState<string | null>(null);
  const [alertBuckets, setAlertBuckets] = useState<CommandCenterAlertBuckets | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  // Stagger gates: in __all__ mode, fan-out work is heavy server-side. Holding
  // back hourly-sales until KPIs settle and alerts until hourly-sales settle
  // avoids 3 parallel endpoints contending for the same Mongo scans.
  const [kpisSettled, setKpisSettled] = useState(false);
  const [hourlySettled, setHourlySettled] = useState(false);
  const canStartHourly = !allLocationsSelected || kpisSettled;
  const canStartAlerts = !allLocationsSelected || hourlySettled;
  const dismissedAlertIdsRef = useRef<Set<string>>(new Set());
  const [historyModal, setHistoryModal] = useState<{
    categoryId: AlertRoleBindingCategory;
    title: string;
  } | null>(null);

  useEffect(() => {
    setKpisSettled(false);
    setHourlySettled(false);
  }, [locationId, allLocationsSelected]);

  useEffect(() => {
    if (!locationId || !shouldFetchKpis || kpiMetrics.length === 0) {
      setKpis(null);
      setError(null);
      setLoading(false);
      setKpisSettled(true);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    commandCenterService
      .getKPIs(locationId, {
        metrics: kpiMetrics,
        periods: ['today', 'weekToDate', 'monthToDate', 'lastWeek'],
        signal: controller.signal,
      })
      .then(setKpis)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load KPIs");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setKpisSettled(true);
        }
      });
    return () => controller.abort();
  }, [locationId, shouldFetchKpis, kpiMetrics.join(",")]);

  useEffect(() => {
    if (!locationId || !shouldFetchHourly) {
      setHourlySales(null);
      setHourlySalesError(null);
      setHourlySalesLoading(false);
      setHourlySettled(true);
      return;
    }
    if (!canStartHourly) return;
    const controller = new AbortController();
    setHourlySalesLoading(true);
    setHourlySalesError(null);
    commandCenterService
      .getHourlySales(locationId, { signal: controller.signal })
      .then(setHourlySales)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setHourlySalesError(err instanceof Error ? err.message : 'Failed to load hourly sales');
        setHourlySales(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHourlySalesLoading(false);
          setHourlySettled(true);
        }
      });
    return () => controller.abort();
  }, [locationId, shouldFetchHourly, canStartHourly]);

  useEffect(() => {
    if (!locationId || !showAlerts) {
      setAlertBuckets(null);
      setAlertsError(null);
      setAlertsLoading(false);
      return;
    }
    if (!canStartAlerts) return;
    const controller = new AbortController();
    setAlertsLoading(true);
    setAlertsError(null);
    commandCenterService
      .getAlerts(locationId, { signal: controller.signal })
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
  }, [locationId, showAlerts, canStartAlerts]);

  const dismissAlertById = useCallback(async (notificationId: string) => {
    await commandCenterService.dismissAlerts([notificationId]);
    dismissedAlertIdsRef.current.add(notificationId);
    setAlertBuckets((prev) => {
      if (prev == null) return prev;
      return {
        financial_labor: prev.financial_labor.filter((r) => r.id !== notificationId),
        inventory_supply_chain: prev.inventory_supply_chain.filter((r) => r.id !== notificationId),
        reputation_hr: prev.reputation_hr.filter((r) => r.id !== notificationId),
      };
    });
  }, []);

  const handleDismissAlert = useCallback(
    async (notificationId: string) => {
      try {
        await dismissAlertById(notificationId);
      } catch {
        setAlertsError('Could not dismiss alert. Try again.');
      }
    },
    [dismissAlertById],
  );

  const handleSocketNotificationNew = useCallback((payload: unknown) => {
    if (payload == null || typeof payload !== 'object') return;
    if (!currentLocation?._id) return;
    if (allLocationsSelected) return;

    const timezone = currentLocation.timezone?.trim() || 'America/Denver';
    const todayKey = getTodayInTimezone(timezone);
    const locationId = currentLocation._id;

    const parsed = tryCommandCenterRowFromNotificationNew(
      payload as NotificationNewPayload,
      {
        locationId,
        timezone,
        todayKey,
        dismissedIds: dismissedAlertIdsRef.current,
        canFinancial: canAlertsFinancial,
        canInventory: canAlertsInventory,
        canReputation: canAlertsReputation,
      },
    );
    const t = (payload as { type?: unknown })?.type;
    if (parsed == null && t === 'alert_inventory_low_inventory') {
      console.debug('[CommandCenter] low-inventory realtime ignored', {
        payload,
        locationId,
        timezone,
        todayKey,
      });
    }
    if (parsed == null) return;
    const { row, category } = parsed;

    setAlertBuckets((prev) => {
      const base: CommandCenterAlertBuckets =
        prev ?? {
          financial_labor: [],
          inventory_supply_chain: [],
          reputation_hr: [],
        };
      const list = base[category];
      if (list.some((r) => r.id === row.id)) return prev ?? base;
      return {
        ...base,
        [category]: [row, ...list],
      };
    });
  }, [
    currentLocation?._id,
    currentLocation?.timezone,
    allLocationsSelected,
    canAlertsFinancial,
    canAlertsInventory,
    canAlertsReputation,
  ]);

  useEffect(() => {
    if (!showAlerts || currentLocation?._id == null) return;
    if (allLocationsSelected) return;
    const sock = getSocket();
    if (sock == null) return;

    sock.on('notification:new', handleSocketNotificationNew);
    return () => {
      sock.off('notification:new', handleSocketNotificationNew);
    };
  }, [
    showAlerts,
    currentLocation?._id,
    currentLocation?.timezone,
    allLocationsSelected,
    canAlertsFinancial,
    canAlertsInventory,
    canAlertsReputation,
    handleSocketNotificationNew,
  ]);

  const commandCenterKPIs = useMemo(() => {
    return buildCommandCenterKPIItems({
      kpis,
      loading,
      canNetSales,
      canLaborCost,
      canReviewRating,
      kpiPeriod,
      icons: {
        dollar: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        laborCost: <LaborCostIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        starTitle: <StarIcon className={REVIEW_RATING_KPI_SUBTITLE_STAR_CLASS} aria-hidden />,
        starSubtitle: <StarIcon className={REVIEW_RATING_KPI_SUBTITLE_STAR_CLASS} aria-hidden />,
      },
    });
  }, [
    kpis,
    loading,
    canNetSales,
    canLaborCost,
    canReviewRating,
    kpiPeriod,
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
    const cats: AlertCategory[] = [];
    const includeLocationLine = allLocationsSelected;
    if (canAlertsFinancial) {
      cats.push({
        id: 'financial_labor',
        title: 'Financial & Labor',
        icon: financialAlertsIcon,
        alerts: sortAlertItemsNewestFirst<AlertItem>(
          alertBuckets?.financial_labor.map((r) =>
            commandCenterAlertRowToAlertItem(r, { includeLocationLine }),
          ) ?? [],
        ),
      });
    }
    if (canAlertsInventory) {
      cats.push({
        id: 'inventory_supply_chain',
        title: 'Inventory & Supply Chain',
        icon: inventoryAlertsIcon,
        alerts: sortAlertItemsNewestFirst<AlertItem>(
          alertBuckets?.inventory_supply_chain.map((r) =>
            commandCenterAlertRowToAlertItem(r, { includeLocationLine }),
          ) ?? [],
        ),
      });
    }
    if (canAlertsReputation) {
      cats.push({
        id: 'reputation_hr',
        title: 'Reputation & HR',
        icon: reputationAlertsIcon,
        alerts: sortAlertItemsNewestFirst<AlertItem>(
          alertBuckets?.reputation_hr.map((r) =>
            commandCenterAlertRowToAlertItem(r, { includeLocationLine }),
          ) ?? [],
        ),
      });
    }
    return cats;
  }, [
    alertBuckets,
    canAlertsFinancial,
    canAlertsInventory,
    canAlertsReputation,
    allLocationsSelected,
  ]);

  return (
    <Layout>
      <div className="p-6 min-h-[200px]">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <CommandCenterIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Command Center
          </h2>
          {commandCenterKPIs.length > 0 && (
            <Dropdown
              options={COMMAND_CENTER_KPI_PERIOD_OPTIONS}
              value={kpiPeriod}
              onChange={(v) => setKpiPeriod(v as CommandCenterKPIPeriod)}
              placeholder="Today"
              aria-label="Command Center KPI period"
              className="min-w-[10rem] text-[10px] md:text-xs 2xl:text-sm"
              allowEmpty={false}
            />
          )}
        </div>

        {!locationId && (
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
                yAxis={{ valueFormatter: buildCurrencyAxisFormatter(), label: 'Sales ($)' }}
                loading={hourlySalesLoading}
                error={hourlySalesError}
              />
            )}
            {canLaborGauge && (() => {
              const gaugeToday =
                kpis != null && isCommandCenterKPIsMulti(kpis) ? kpis.today : kpis;
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
                  subtitle={allLocationsSelected ? "Labor Cost as % of Net Sales (Avg goal)" : "Labor Cost as % of Net Sales"}
                  overTarget={overTarget}
                  loading={loading}
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
            onViewAll={(categoryId) => {
              const cid = categoryId as AlertRoleBindingCategory;
              setHistoryModal({
                categoryId: cid,
                title: ALERT_HISTORY_CATEGORY_TITLE[cid],
              });
            }}
          />
        )}

        {showAlerts && historyModal != null && locationId != null && (
          <CommandCenterAlertsHistoryModal
            open
            onClose={() => setHistoryModal(null)}
            categoryId={historyModal.categoryId}
            categoryTitle={historyModal.title}
            locationId={locationId}
          />
        )}
      </div>
    </Layout>
  );
};

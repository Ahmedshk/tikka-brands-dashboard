import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import {
  InventoryKPICards,
  CostOfGoodsSoldCard,
  VarianceChartCard,
  OrderTrackerCard,
} from '../../components/InventoryFoodCost';
import type {
  InventoryKPIItem,
  PendingOrdersKPIPeriod,
} from '../../components/InventoryFoodCost/InventoryKPICards';
import { OrderTrackerModal } from '../../components/modal/OrderTrackerModal';
import { OrderDetailModal } from '../../components/modal/OrderDetailModal';
import { VarianceChartModal } from '../../components/modal/VarianceChartModal';
import { inventoryService, type OrderTrackerOrder } from '../../services/inventory.service';
import type { OrderTrackerPeriodValue } from '../../components/InventoryFoodCost/OrderTrackerPeriodPicker';
import { goalService, getTodayInTimezone } from '../../services/goal.service';
import type { Goal } from '../../types';
import InventoryAndFoodCostIcon from '@assets/icons/inventory_and_food_cost.svg?react';
import DollarIcon from '@assets/icons/dollar.svg?react';
import PendingOrdersIcon from '@assets/icons/pending_orders.svg?react';
import type { RootState } from '../../store/store';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';

const PAGE_ID = 'inventory-food-cost';
const ORDER_TRACKER_CARD_SIZE = 12;

const currencyFmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const pendingFmt = (n: number) => String(n).padStart(2, '0');

const defaultOrderTrackerPeriod: OrderTrackerPeriodValue = {
  periodType: 'currentMonth',
};

export const InventoryFoodCost = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const canKpiFoodCost = useCanAccessComponent(PAGE_ID, 'kpi-current-food-cost');
  const canKpiInventory = useCanAccessComponent(PAGE_ID, 'kpi-inventory-value');
  const canKpiWaste = useCanAccessComponent(PAGE_ID, 'kpi-waste-cost');
  const canKpiPending = useCanAccessComponent(PAGE_ID, 'kpi-pending-orders');
  const canCostOfGoods = useCanAccessComponent(PAGE_ID, 'cost-of-goods-sold-gauge');
  const canVariance = useCanAccessComponent(PAGE_ID, 'food-cost-variance');
  const canOrderTracker = useCanAccessComponent(PAGE_ID, 'order-tracker');

  const shouldFetchKpis =
    canKpiFoodCost || canKpiInventory || canKpiWaste || canKpiPending || canCostOfGoods || canVariance;
  const kpiMetrics = useMemo(() => {
    const m: string[] = [];
    if (canKpiFoodCost) m.push('currentFoodCost');
    if (canKpiInventory) m.push('inventoryValue');
    if (canKpiWaste) m.push('wasteCost');
    if (canKpiPending) m.push('pendingOrdersCount');
    if (canCostOfGoods) {
      m.push('foodCostPercent', 'theoreticalUsage', 'theoreticalUsagePercent');
      if (!m.includes('currentFoodCost')) m.push('currentFoodCost');
    }
    if (canVariance) m.push('varianceItems');
    return [...new Set(m)];
  }, [canKpiFoodCost, canKpiInventory, canKpiWaste, canKpiPending, canCostOfGoods, canVariance]);
  const shouldFetchGoals = canCostOfGoods;
  const shouldFetchOrders = canOrderTracker;

  const [orderTrackerModalOpen, setOrderTrackerModalOpen] = useState(false);
  const [orderDetailModalOpen, setOrderDetailModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<OrderTrackerOrder | null>(null);
  const [orderTrackerPeriod, setOrderTrackerPeriod] = useState<OrderTrackerPeriodValue>(defaultOrderTrackerPeriod);
  const [orderTrackerOrders, setOrderTrackerOrders] = useState<OrderTrackerOrder[]>([]);
  const [orderTrackerLoading, setOrderTrackerLoading] = useState(!!currentLocation?._id && shouldFetchOrders);
  const [orderTrackerError, setOrderTrackerError] = useState<string | null>(null);
  const [varianceModalOpen, setVarianceModalOpen] = useState(false);
  const [varianceBarBandWidth, setVarianceBarBandWidth] = useState<number | null>(null);
  const [inventoryKpisData, setInventoryKpisData] = useState<Awaited<ReturnType<typeof inventoryService.getInventoryKPIs>> | null>(null);
  const [kpisLoading, setKpisLoading] = useState(!!currentLocation?._id && shouldFetchKpis);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal | null>(null);
  const [pendingOrdersPeriod, setPendingOrdersPeriod] = useState<PendingOrdersKPIPeriod>('thisWeek');

  useEffect(() => {
    if (!currentLocation?._id || !shouldFetchKpis || kpiMetrics.length === 0) {
      setInventoryKpisData(null);
      setKpisError(null);
      setKpisLoading(false);
      return;
    }
    const controller = new AbortController();
    setKpisLoading(true);
    setKpisError(null);
    inventoryService
      .getInventoryKPIs(currentLocation._id, {
        metrics: kpiMetrics,
        pendingOrdersPeriod: canKpiPending ? pendingOrdersPeriod : undefined,
        signal: controller.signal,
      })
      .then(setInventoryKpisData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setKpisError(err instanceof Error ? err.message : 'Failed to load inventory KPIs');
        setInventoryKpisData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setKpisLoading(false);
      });
    return () => controller.abort();
  }, [
    currentLocation?._id,
    shouldFetchKpis,
    kpiMetrics.join(','),
    canKpiPending ? pendingOrdersPeriod : null,
  ]);

  useEffect(() => {
    if (!currentLocation?._id || !shouldFetchGoals) {
      setGoals(null);
      return;
    }
    const controller = new AbortController();
    const date = getTodayInTimezone(currentLocation.timezone ?? 'UTC');
    goalService
      .getResolved(currentLocation._id, date, { signal: controller.signal })
      .then(setGoals)
      .catch(() => {
        if (!controller.signal.aborted) setGoals(null);
      });
    return () => controller.abort();
  }, [currentLocation?._id, currentLocation?.timezone, shouldFetchGoals]);

  const countPeriodLabel = useMemo(() => {
    const start = inventoryKpisData?.countPeriodStart;
    const end = inventoryKpisData?.countPeriodEnd;
    if (!start || !end) return '—';
    const parse = (s: string) => {
      const [y, m, d] = s.split('/').map(Number);
      return new Date(y, (m ?? 1) - 1, d ?? 1);
    };
    const fmt = (date: Date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    try {
      return `${fmt(parse(start))} – ${fmt(parse(end))}`;
    } catch {
      return '—';
    }
  }, [inventoryKpisData?.countPeriodStart, inventoryKpisData?.countPeriodEnd]);

  const pendingOrdersPeriodLabel = useMemo(() => {
    const start = inventoryKpisData?.pendingOrdersPeriodStart;
    const end = inventoryKpisData?.pendingOrdersPeriodEnd;
    if (!start || !end) return '—';
    const parse = (s: string) => {
      const [y, m, d] = s.split('/').map(Number);
      return new Date(y, (m ?? 1) - 1, d ?? 1);
    };
    const fmt = (date: Date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    try {
      return `${fmt(parse(start))} – ${fmt(parse(end))}`;
    } catch {
      return '—';
    }
  }, [inventoryKpisData?.pendingOrdersPeriodStart, inventoryKpisData?.pendingOrdersPeriodEnd]);

  const inventoryKPIs = useMemo((): InventoryKPIItem[] => {
    const d = inventoryKpisData;
    const foodCostValue = d?.currentFoodCost != null ? currencyFmt(d.currentFoodCost) : (kpisLoading ? '…' : '—');
    const inventoryValue = d?.inventoryValue != null ? currencyFmt(d.inventoryValue) : (kpisLoading ? '…' : '—');
    const wasteCostValue = d?.wasteCost != null ? currencyFmt(d.wasteCost) : (kpisLoading ? '…' : '—');
    const pendingValue = d?.pendingOrdersCount != null ? pendingFmt(d.pendingOrdersCount) : (kpisLoading ? '…' : '—');
    const items: InventoryKPIItem[] = [];
    if (canKpiFoodCost) {
      items.push({
        title: 'Current Food Cost',
        timePeriod: countPeriodLabel,
        value: foodCostValue,
        accentColor: 'green',
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        loading: kpisLoading,
      });
    }
    if (canKpiInventory) {
      items.push({
        title: 'Inventory value',
        timePeriod: countPeriodLabel,
        value: inventoryValue,
        accentColor: 'blue',
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        loading: kpisLoading,
      });
    }
    if (canKpiWaste) {
      items.push({
        title: 'Waste Cost',
        timePeriod: countPeriodLabel,
        value: wasteCostValue,
        accentColor: 'orange',
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        loading: kpisLoading,
      });
    }
    if (canKpiPending) {
      items.push({
        title: 'Pending Orders',
        timePeriod: pendingOrdersPeriodLabel,
        value: pendingValue,
        accentColor: 'purple',
        rightIcon: <PendingOrdersIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
        loading: kpisLoading,
        period: pendingOrdersPeriod,
        onPeriodChange: setPendingOrdersPeriod,
      });
    }
    return items;
  }, [
    inventoryKpisData,
    kpisLoading,
    countPeriodLabel,
    pendingOrdersPeriodLabel,
    canKpiFoodCost,
    canKpiInventory,
    canKpiWaste,
    canKpiPending,
    pendingOrdersPeriod,
  ]);

  useEffect(() => {
    if (!currentLocation?._id || !shouldFetchOrders) {
      setOrderTrackerOrders([]);
      setOrderTrackerError(null);
      setOrderTrackerLoading(false);
      return;
    }
    const isCustom = orderTrackerPeriod.periodType === 'custom';
    const hasCustomDates =
      Boolean(orderTrackerPeriod.periodStart) && Boolean(orderTrackerPeriod.periodEnd);
    if (isCustom && !hasCustomDates) {
      setOrderTrackerOrders([]);
      setOrderTrackerError(null);
      setOrderTrackerLoading(false);
      return;
    }
    const controller = new AbortController();
    setOrderTrackerLoading(true);
    setOrderTrackerError(null);
    inventoryService
      .getOrders(currentLocation._id, orderTrackerPeriod, { signal: controller.signal })
      .then(setOrderTrackerOrders)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setOrderTrackerError(err instanceof Error ? err.message : 'Failed to load orders');
        setOrderTrackerOrders([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setOrderTrackerLoading(false);
      });
    return () => controller.abort();
  }, [currentLocation?._id, shouldFetchOrders, orderTrackerPeriod.periodType, orderTrackerPeriod.periodStart, orderTrackerPeriod.periodEnd]);

  const orderTrackerCardRows = orderTrackerOrders.slice(0, ORDER_TRACKER_CARD_SIZE);

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <InventoryAndFoodCostIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Inventory & Food Cost
          </h2>
        </div>

        {!currentLocation && (
          <p className="text-sm text-secondary mb-6">Select a location to view inventory KPIs.</p>
        )}
        {shouldFetchKpis && currentLocation && kpisError && (
          <p className="text-sm text-red-600 mb-6" role="alert">{kpisError}</p>
        )}
        {shouldFetchKpis && currentLocation && inventoryKPIs.length > 0 && (
          <InventoryKPICards items={inventoryKPIs} />
        )}

        {canOrderTracker && currentLocation && orderTrackerError && (
          <p className="text-sm text-red-600 mb-2" role="alert">
            Order Tracker: {orderTrackerError}
          </p>
        )}
        {(canCostOfGoods || canVariance || canOrderTracker) && (
          <div
            className={
              (canCostOfGoods || canVariance) && canOrderTracker
                ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6'
                : 'grid grid-cols-1 gap-6 mb-6'
            }
          >
            {(canCostOfGoods || canVariance) && (
              <div className="flex flex-col gap-6 order-1 lg:order-1">
                {canCostOfGoods && (
                  <CostOfGoodsSoldCard
                    value={inventoryKpisData?.foodCostPercent ?? 0}
                    goal={goals?.foodCostGoal ?? null}
                    timePeriod={kpisLoading ? null : countPeriodLabel}
                    overTarget={
                      inventoryKpisData?.foodCostPercent != null && goals?.foodCostGoal != null
                        ? inventoryKpisData.foodCostPercent - goals.foodCostGoal
                        : null
                    }
                    theoreticalUsage={inventoryKpisData?.theoreticalUsage ?? null}
                    theoreticalUsagePercent={inventoryKpisData?.theoreticalUsagePercent ?? null}
                    actualUsage={inventoryKpisData?.currentFoodCost ?? null}
                    actualUsagePercent={inventoryKpisData?.foodCostPercent ?? null}
                    loading={kpisLoading}
                  />
                )}
                {canVariance && (
                  <VarianceChartCard
                    items={inventoryKpisData?.varianceItems ?? []}
                    timePeriod={kpisLoading ? null : countPeriodLabel}
                    loading={kpisLoading}
                    onViewAll={(barBandWidth) => {
                      setVarianceBarBandWidth(barBandWidth);
                      setVarianceModalOpen(true);
                    }}
                  />
                )}
              </div>
            )}

            {canOrderTracker && (
              <OrderTrackerCard
                timePeriod={orderTrackerPeriod}
                onPeriodChange={setOrderTrackerPeriod}
                rows={orderTrackerCardRows}
                loading={orderTrackerLoading}
                onViewAll={() => setOrderTrackerModalOpen(true)}
                onView={(order) => {
                  setSelectedOrderForDetail(order);
                  setOrderDetailModalOpen(true);
                }}
                className={
                  canCostOfGoods || canVariance
                    ? 'order-3 lg:order-2 min-h-0 lg:h-full'
                    : 'min-h-0'
                }
              />
            )}
          </div>
        )}
      </div>

      <OrderTrackerModal
        isOpen={orderTrackerModalOpen}
        onClose={() => setOrderTrackerModalOpen(false)}
        rows={orderTrackerOrders}
        onView={(order) => {
          setSelectedOrderForDetail(order);
          setOrderDetailModalOpen(true);
        }}
      />
      <OrderDetailModal
        isOpen={orderDetailModalOpen}
        onClose={() => {
          setOrderDetailModalOpen(false);
          setSelectedOrderForDetail(null);
        }}
        order={selectedOrderForDetail}
      />
      <VarianceChartModal
        isOpen={varianceModalOpen}
        onClose={() => setVarianceModalOpen(false)}
        items={inventoryKpisData?.varianceItems ?? []}
        barBandWidth={varianceBarBandWidth}
      />
    </Layout>
  );
};

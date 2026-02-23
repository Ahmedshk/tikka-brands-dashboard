import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import {
  InventoryKPICards,
  CostOfGoodsSoldCard,
  VarianceChartCard,
  OrderTrackerCard,
} from '../../components/InventoryFoodCost';
import type { InventoryKPIItem } from '../../components/InventoryFoodCost/InventoryKPICards';
import { OrderTrackerModal } from '../../components/modal/OrderTrackerModal';
import { VarianceChartModal } from '../../components/modal/VarianceChartModal';
import type { VarianceChartItem } from '../../components/InventoryFoodCost/VarianceChartCard';
import { inventoryService } from '../../services/inventory.service';
import { goalService } from '../../services/goal.service';
import type { Goal } from '../../types';
import InventoryAndFoodCostIcon from '@assets/icons/inventory_and_food_cost.svg?react';
import DollarIcon from '@assets/icons/dollar.svg?react';
import PendingOrdersIcon from '@assets/icons/pending_orders.svg?react';
import { Spinner } from '../../components/common/Spinner';
import type { RootState } from '../../store/store';

const ORDER_TRACKER_CARD_SIZE = 12;

const currencyFmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const pendingFmt = (n: number) => String(n).padStart(2, '0');

type OrderStatus = 'Received' | 'Pending';

const orderTrackerRows: { poNumber: string; supplier: string; date: string; status: OrderStatus }[] = [
  { poNumber: '12345', supplier: 'Fresh Produce', date: 'Mar 25', status: 'Received' },
  { poNumber: '12345', supplier: 'Dairy Supplier', date: 'Mar 26', status: 'Pending' },
  { poNumber: '12345', supplier: 'Meat Distributors', date: 'Mar 27', status: 'Received' },
  { poNumber: '12345', supplier: 'Fresh Produce', date: 'Mar 28', status: 'Received' },
  { poNumber: '12345', supplier: 'Dairy Supplier', date: 'Mar 29', status: 'Received' },
  { poNumber: '12345', supplier: 'Meat Distributors', date: 'Mar 30', status: 'Received' },
  { poNumber: '12345', supplier: 'Fresh Produce', date: 'Apr 15', status: 'Received' },
  { poNumber: '12345', supplier: 'Dairy Supplier', date: 'Apr 16', status: 'Received' },
  { poNumber: '12345', supplier: 'Meat Distributors', date: 'Apr 17', status: 'Pending' },
  { poNumber: '12345', supplier: 'Fresh Produce', date: 'Apr 18', status: 'Pending' },
  { poNumber: '12345', supplier: 'Dairy Supplier', date: 'Apr 19', status: 'Received' },
  { poNumber: '12345', supplier: 'Meat Distributors', date: 'Apr 20', status: 'Received' },
  { poNumber: '12345', supplier: 'Fresh Produce', date: 'Apr 21', status: 'Received' },
  { poNumber: '12345', supplier: 'Dairy Supplier', date: 'Apr 22', status: 'Received' },
  { poNumber: '12345', supplier: 'Meat Distributors', date: 'Apr 23', status: 'Received' },
  { poNumber: '12345', supplier: 'Fresh Produce', date: 'Apr 24', status: 'Pending' },
  { poNumber: '12345', supplier: 'Dairy Supplier', date: 'Apr 25', status: 'Received' },
  { poNumber: '12345', supplier: 'Meat Distributors', date: 'Apr 26', status: 'Received' },
];

const fullVarianceItems: VarianceChartItem[] = [
  { label: 'Meat', varianceCost: 350, actualCost: 1850, theoreticalCost: 1500, actualQuantity: 120, theoreticalQuantity: 100 },
  { label: 'Seafood', varianceCost: -150, actualCost: 850, theoreticalCost: 1000, actualQuantity: 45, theoreticalQuantity: 50 },
  { label: 'Produce', varianceCost: 350, actualCost: 1350, theoreticalCost: 1000, actualQuantity: 220, theoreticalQuantity: 180 },
  { label: 'Dairy', varianceCost: 150, actualCost: 650, theoreticalCost: 500, actualQuantity: 80, theoreticalQuantity: 70 },
  { label: 'Bakery', varianceCost: -50, actualCost: 200, theoreticalCost: 250, actualQuantity: 30, theoreticalQuantity: 35 },
  { label: 'Pantry', varianceCost: 150, actualCost: 450, theoreticalCost: 300, actualQuantity: 95, theoreticalQuantity: 80 },
  { label: 'Chicken Wings', varianceCost: -125, actualCost: 375, theoreticalCost: 500, actualQuantity: 55, theoreticalQuantity: 70 },
  { label: 'Mozzarella Cheese', varianceCost: -98, actualCost: 202, theoreticalCost: 300, actualQuantity: 22, theoreticalQuantity: 28 },
  { label: 'Tomato Sauce', varianceCost: -85, actualCost: 165, theoreticalCost: 250, actualQuantity: 33, theoreticalQuantity: 42 },
  { label: 'Ground Beef', varianceCost: -72, actualCost: 328, theoreticalCost: 400, actualQuantity: 41, theoreticalQuantity: 48 },
  { label: 'French Fries 1', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 2', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 3', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 4', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 5', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 6', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 7', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 8', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 9', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 10', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
  { label: 'French Fries 11', varianceCost: -62, actualCost: 188, theoreticalCost: 250, actualQuantity: 94, theoreticalQuantity: 110 },
];

export const InventoryFoodCost = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [orderTrackerModalOpen, setOrderTrackerModalOpen] = useState(false);
  const [varianceModalOpen, setVarianceModalOpen] = useState(false);
  const [inventoryKpisData, setInventoryKpisData] = useState<Awaited<ReturnType<typeof inventoryService.getInventoryKPIs>> | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal | null>(null);

  useEffect(() => {
    if (!currentLocation?._id) {
      setInventoryKpisData(null);
      setKpisError(null);
      return;
    }
    setKpisLoading(true);
    setKpisError(null);
    inventoryService
      .getInventoryKPIs(currentLocation._id)
      .then(setInventoryKpisData)
      .catch((err) => {
        setKpisError(err instanceof Error ? err.message : 'Failed to load inventory KPIs');
        setInventoryKpisData(null);
      })
      .finally(() => setKpisLoading(false));
  }, [currentLocation?._id]);

  useEffect(() => {
    if (!currentLocation?._id) {
      setGoals(null);
      return;
    }
    goalService
      .getByLocationId(currentLocation._id)
      .then(setGoals)
      .catch(() => setGoals(null));
  }, [currentLocation?._id]);

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
    return [
      {
        title: 'Current Food Cost',
        timePeriod: countPeriodLabel,
        value: foodCostValue,
        accentColor: 'green',
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Inventory value',
        timePeriod: countPeriodLabel,
        value: inventoryValue,
        accentColor: 'blue',
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Waste Cost',
        timePeriod: countPeriodLabel,
        value: wasteCostValue,
        accentColor: 'orange',
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Pending Orders',
        timePeriod: pendingOrdersPeriodLabel,
        value: pendingValue,
        accentColor: 'purple',
        rightIcon: <PendingOrdersIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
    ];
  }, [inventoryKpisData, kpisLoading, countPeriodLabel, pendingOrdersPeriodLabel]);

  const orderTrackerCardRows = orderTrackerRows.slice(0, ORDER_TRACKER_CARD_SIZE);

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
        {currentLocation && kpisError && (
          <p className="text-sm text-red-600 mb-6" role="alert">{kpisError}</p>
        )}
        {currentLocation && kpisLoading && (
          <div className="flex items-center justify-center gap-2 py-8 mb-6">
            <Spinner size="lg" className="text-button-primary" />
            <span className="text-sm text-primary">Loading inventory KPIs…</span>
          </div>
        )}
        {currentLocation && !kpisLoading && (
          <InventoryKPICards items={inventoryKPIs} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="flex flex-col gap-6 order-1 lg:order-1">
            <CostOfGoodsSoldCard
              value={inventoryKpisData?.foodCostPercent ?? 0}
              goal={goals?.foodCostGoal ?? null}
              timePeriod={countPeriodLabel}
              overTarget={
                inventoryKpisData?.foodCostPercent != null && goals?.foodCostGoal != null
                  ? inventoryKpisData.foodCostPercent - goals.foodCostGoal
                  : null
              }
              theoreticalUsage={inventoryKpisData?.theoreticalUsage ?? null}
              theoreticalUsagePercent={inventoryKpisData?.theoreticalUsagePercent ?? null}
              actualUsage={inventoryKpisData?.currentFoodCost ?? null}
              actualUsagePercent={inventoryKpisData?.foodCostPercent ?? null}
            />
            <VarianceChartCard items={fullVarianceItems} onViewAll={() => setVarianceModalOpen(true)} />
          </div>

          <OrderTrackerCard
            rows={orderTrackerCardRows}
            onViewAll={() => setOrderTrackerModalOpen(true)}
            className="order-3 lg:order-2 min-h-0 lg:h-full"
          />
        </div>
      </div>

      <OrderTrackerModal
        isOpen={orderTrackerModalOpen}
        onClose={() => setOrderTrackerModalOpen(false)}
        rows={orderTrackerRows}
      />
      <VarianceChartModal
        isOpen={varianceModalOpen}
        onClose={() => setVarianceModalOpen(false)}
        items={[...fullVarianceItems].sort((a, b) => b.varianceCost - a.varianceCost)}
      />
    </Layout>
  );
};

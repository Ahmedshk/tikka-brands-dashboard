import type { ReactNode } from 'react';
import type { SalesLaborKPIsData } from '../services/commandCenter.service';
import type { SalesLaborKPIItem } from '../components/SalesLabor';
import { formatCurrency } from './salesLaborDetailsHelpers';

const UNAVAIL = '—';

function fmtNum(n: number | null, asCurrency: boolean): string {
  if (n == null) return UNAVAIL;
  return asCurrency ? formatCurrency(n) : String(n);
}

function fmtPercent(n: number | null): string {
  return n == null ? UNAVAIL : `${Number(n.toFixed(1))}%`;
}

function fmtWhole(n: number | null): string {
  return n == null ? UNAVAIL : String(Math.round(n));
}

function fmtHours(n: number | null): string {
  return n == null ? UNAVAIL : Number(n).toFixed(2);
}

export interface SalesLaborKpiBuilderIcons {
  dollar: ReactNode;
  actualLaborCost: ReactNode;
  totalHours: ReactNode;
  salesPerManHour: ReactNode;
  noOfTransactions: ReactNode;
  averageCheck: ReactNode;
  totalDiscounts: ReactNode;
  totalRefunds: ReactNode;
}

export interface BuildSalesLaborKPIItemsParams {
  kpis: SalesLaborKPIsData | null;
  loading: boolean;
  canKpi1: boolean;
  canKpi2: boolean;
  canKpi3: boolean;
  canKpi4: boolean;
  canKpi5: boolean;
  canKpi6: boolean;
  canKpi7: boolean;
  canKpi8: boolean;
  icons: SalesLaborKpiBuilderIcons;
}

export function buildSalesLaborKPIItems(params: BuildSalesLaborKPIItemsParams): SalesLaborKPIItem[] {
  const { kpis, loading, icons } = params;
  const items: SalesLaborKPIItem[] = [];

  if (params.canKpi1) {
    items.push({
      title: 'Actual Total Net Sales',
      timePeriod: 'Today',
      value: fmtNum(kpis?.actualTotalSales ?? null, true),
      accentColor: 'green',
      rightIcon: icons.dollar,
      loading,
    });
  }
  if (params.canKpi2) {
    items.push({
      title: 'Actual Labor Cost %',
      timePeriod: 'Today',
      value: fmtPercent(kpis?.actualLaborCostPercent ?? null),
      accentColor: 'blue',
      rightIcon: icons.actualLaborCost,
      loading,
    });
  }
  if (params.canKpi3) {
    items.push({
      title: 'Total Hours',
      timePeriod: 'Today',
      value: fmtHours(kpis?.totalHours ?? null),
      accentColor: 'orange',
      rightIcon: icons.totalHours,
      loading,
    });
  }
  if (params.canKpi4) {
    const val = kpis?.salesPerManHour;
    items.push({
      title: 'Sales Per Man Hour',
      timePeriod: 'Today',
      value: val == null ? UNAVAIL : `${formatCurrency(val)}/hr`,
      accentColor: 'purple',
      rightIcon: icons.salesPerManHour,
      loading,
    });
  }
  if (params.canKpi5) {
    items.push({
      title: 'No. of Transactions',
      timePeriod: 'Today',
      value: fmtWhole(kpis?.transactionCount ?? null),
      accentColor: 'gray',
      rightIcon: icons.noOfTransactions,
      loading,
    });
  }
  if (params.canKpi6) {
    items.push({
      title: 'Average Check',
      timePeriod: 'Today',
      value: fmtNum(kpis?.averageCheck ?? null, true),
      accentColor: 'red',
      rightIcon: icons.averageCheck,
      loading,
    });
  }
  if (params.canKpi7) {
    items.push({
      title: 'Total Discounts',
      timePeriod: 'Today',
      value: fmtNum(kpis?.totalDiscounts ?? null, true),
      accentColor: 'azure',
      rightIcon: icons.totalDiscounts,
      loading,
    });
  }
  if (params.canKpi8) {
    const refundCount = typeof kpis?.totalRefundCount === 'number'
      ? String(kpis.totalRefundCount).padStart(2, '0')
      : undefined;
    items.push({
      title: 'Total Refunds',
      timePeriod: 'Today',
      value: fmtNum(kpis?.totalRefunds ?? null, true),
      accentColor: 'yellow',
      subtitle: '#Refunds',
      extra: refundCount,
      extraClassName: 'bg-quaternary/20 text-primary',
      rightIcon: icons.totalRefunds,
      loading,
    });
  }

  return items;
}

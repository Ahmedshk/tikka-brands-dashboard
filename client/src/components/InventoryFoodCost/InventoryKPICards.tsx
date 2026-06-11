import { ReactNode } from 'react';
import { KPICard } from '../common/KPICard';
import type { KPICardAccentColor } from '../common/KPICard';
import { Dropdown } from '../common/Dropdown';

export type PendingOrdersKPIPeriod = 'thisWeek' | 'lastWeek';

export interface InventoryKPIItem {
  title: string;
  timePeriod?: string;
  value: string;
  accentColor: KPICardAccentColor;
  rightIcon?: ReactNode;
  loading?: boolean;
  /** When set (e.g. for Pending Orders card), show period dropdown */
  period?: PendingOrdersKPIPeriod;
  onPeriodChange?: (period: PendingOrdersKPIPeriod) => void;
}

export interface InventoryKPICardsProps {
  items: InventoryKPIItem[];
}

const PENDING_ORDERS_PERIOD_OPTIONS: {
  value: PendingOrdersKPIPeriod;
  label: string;
}[] = [
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
];

export const InventoryKPICards = ({ items }: InventoryKPICardsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 overflow-visible">
      {items.map((kpi) => {
        const { period, onPeriodChange, ...kpiCardProps } = kpi;
        const titleRight =
          onPeriodChange != null && period != null ? (
            <Dropdown
              options={PENDING_ORDERS_PERIOD_OPTIONS}
              value={period}
              onChange={(v) => onPeriodChange(v as PendingOrdersKPIPeriod)}
              placeholder="This week"
              aria-label={`Period for ${kpi.title}`}
              className="min-w-[7.5rem] text-[10px] md:text-xs 2xl:text-sm"
              allowEmpty={false}
            />
          ) : undefined;
        return (
          <KPICard
            key={kpi.title}
            {...kpiCardProps}
            titleRight={titleRight}
          />
        );
      })}
    </div>
  );
};

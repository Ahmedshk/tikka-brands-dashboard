import { ReactNode } from 'react';
import { KPICard } from '../common/KPICard';
import type { KPICardAccentColor } from '../common/KPICard';

export interface SalesLaborKPIItem {
  title: string;
  timePeriod?: string;
  value: string;
  accentColor: KPICardAccentColor;
  rightIcon?: ReactNode;
  titleIcon?: ReactNode;
  valueClassName?: string;
  badge?: string;
  badgeClassName?: string;
  subtitle?: string;
  subtitleIcon?: ReactNode;
  extra?: string;
  extraClassName?: string;
  loading?: boolean;
}

export interface SalesLaborKPICardsProps {
  items: SalesLaborKPIItem[];
}

export const SalesLaborKPICards = ({ items }: SalesLaborKPICardsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map((kpi) => (
        <KPICard key={kpi.title} {...kpi} />
      ))}
    </div>
  );
};

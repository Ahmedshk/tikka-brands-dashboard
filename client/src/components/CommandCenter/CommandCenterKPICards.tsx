import { ReactNode } from 'react';
import { KPICard } from '../common/KPICard';
import type { KPICardAccentColor } from '../common/KPICard';

export interface CommandCenterKPIItem {
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
  valueFooter?: ReactNode;
  extra?: string;
  extraClassName?: string;
  loading?: boolean;
}

export interface CommandCenterKPICardsProps {
  items: CommandCenterKPIItem[];
}

export const CommandCenterKPICards = ({ items }: CommandCenterKPICardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 overflow-visible">
      {items.map((kpi) => (
        <KPICard key={kpi.title} {...kpi} />
      ))}
    </div>
  );
};

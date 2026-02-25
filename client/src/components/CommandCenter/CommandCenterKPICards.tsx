import { ReactNode } from 'react';
import { KPICard } from '../common/KPICard';
import type { KPICardAccentColor } from '../common/KPICard';
import { Dropdown } from '../common/Dropdown';

export type CommandCenterKPIPeriod = 'today' | 'weekToDate';

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
  extra?: string;
  extraClassName?: string;
  loading?: boolean;
  /** When set, show period selector and use this as selected value */
  period?: CommandCenterKPIPeriod;
  /** When set, show "Today" / "Week to date" selector and call on change */
  onPeriodChange?: (period: CommandCenterKPIPeriod) => void;
}

export interface CommandCenterKPICardsProps {
  items: CommandCenterKPIItem[];
}

const PERIOD_OPTIONS: { value: CommandCenterKPIPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'weekToDate', label: 'Week to date' },
];

export const CommandCenterKPICards = ({ items }: CommandCenterKPICardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {items.map((kpi) => {
        const { period, onPeriodChange, ...kpiCardProps } = kpi;
        const titleRight =
          onPeriodChange != null && period != null ? (
            <Dropdown
              options={PERIOD_OPTIONS}
              value={period}
              onChange={(v) => onPeriodChange(v as CommandCenterKPIPeriod)}
              placeholder="Today"
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

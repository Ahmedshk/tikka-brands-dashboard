import { ReactNode } from 'react';
import { KPICard } from '../common/KPICard';
import type { KPICardAccentColor } from '../common/KPICard';
import { Dropdown } from '../common/Dropdown';

export type CommandCenterKPIPeriod = 'today' | 'weekToDate';
export type ReviewRatingKPIPeriod = 'today' | 'weekToDate' | 'overall';

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
  period?: string;
  /** When set, show period selector and call on change */
  onPeriodChange?: (period: string) => void;
  /** Override default Today / Week to date options */
  periodOptions?: { value: string; label: string }[];
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 overflow-visible">
      {items.map((kpi) => {
        const { period, onPeriodChange, periodOptions, ...kpiCardProps } = kpi;
        const titleRight =
          onPeriodChange != null && period != null ? (
            <Dropdown
              options={periodOptions ?? PERIOD_OPTIONS}
              value={period}
              onChange={(v) => onPeriodChange(v)}
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

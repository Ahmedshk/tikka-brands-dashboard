import { ReactNode } from 'react';
import { Spinner } from './Spinner';

export type KPICardAccentColor = 'green' | 'gray' | 'gold' | 'blue' | 'orange' | 'purple' | 'red' | 'yellow' | 'azure' | 'positive' | 'negative';

const accentBorderClass: Record<KPICardAccentColor, string> = {
  green: 'border-l-[#5DC54F]',
  gold: 'border-l-[#FDB90E]',
  blue: 'border-l-[#009BBE]',
  orange: 'border-l-[#F59E0B]',
  purple: 'border-l-[#BE68FF]',
  red: 'border-l-[#FF1C28]',
  yellow: "border-l-[#FFFF00]",
  gray: "border-l-[#6D6D6D]",
  azure: "border-l-[#79AFFF]",
  positive: 'border-l-positive',
  negative: 'border-l-negative',
};

export interface KPICardProps {
  /** Card title (e.g. "Net Sales") */
  title: string;
  /** Time period shown after title in smaller, lighter text (e.g. "Today", "This Week") */
  timePeriod?: string;
  /** Main value (e.g. "$723.7", "47.7%", "4.3") */
  value: string;
  /** Left accent color */
  accentColor: KPICardAccentColor;
  /** Optional icon shown before the title */
  titleIcon?: ReactNode;
  /** Optional icon in circle on the right inside value container (e.g. dollar sign) */
  rightIcon?: ReactNode;
  /** Optional value color class (e.g. text-green-600); defaults to text-secondary */
  valueClassName?: string;
  /** Optional pill badge on the right inside value container (e.g. "Goal 20%") */
  badge?: string;
  /** Optional badge wrapper class (e.g. bg-green-100 text-green-800) */
  badgeClassName?: string;
  /** Optional subtitle on the right inside value container (e.g. "Good") */
  subtitle?: string;
  /** Optional icon before subtitle inside value container */
  subtitleIcon?: ReactNode;
  /** Optional line under the main value on the left (e.g. overall rating) */
  valueFooter?: ReactNode;
  /** Optional chip on the right inside value container (e.g. "272 Reviews") */
  extra?: string;
  /** Optional class for the extra chip (e.g. bg-yellow-100 text-gray-700) */
  extraClassName?: string;
  /** When true, show a spinner in the value area instead of the value text */
  loading?: boolean;
  /** Optional node rendered in the title row (e.g. period selector) */
  titleRight?: ReactNode;
}

const defaultBadgeClassName = 'bg-green-100 text-green-800';
const defaultExtraClassName = 'bg-quaternary/20 text-primary';

export const KPICard = ({
  title,
  timePeriod,
  value,
  accentColor,
  titleIcon,
  rightIcon,
  valueClassName = 'text-secondary',
  badge,
  badgeClassName = defaultBadgeClassName,
  subtitle,
  subtitleIcon,
  valueFooter,
  extra,
  extraClassName = defaultExtraClassName,
  loading = false,
  titleRight,
}: KPICardProps) => {
  const hasRightContent = !loading && (rightIcon != null || badge != null || subtitle != null || extra != null);

  const renderRightContent = () => {
    if (rightIcon != null) {
      return (
        <div>
          {rightIcon}
        </div>
      );
    }
    if (badge != null) {
      return (
        <span className={`inline-flex flex-shrink-0 items-center px-2.5 py-1 rounded-full text-[10px] md:text-xs 2xl:text-sm font-medium ${badgeClassName}`}>
          {badge}
        </span>
      );
    }
    if (subtitle != null || subtitleIcon != null || extra != null) {
      return (
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {subtitleIcon}
          {subtitle != null && <span className="text-[10px] md:text-xs 2xl:text-sm font-medium text-primary">{subtitle}</span>}
          {extra != null && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] md:text-xs 2xl:text-sm font-medium ${extraClassName}`}>
              {extra}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`bg-card-background rounded-xl shadow border border-gray-200 overflow-visible border-l-8 ${accentBorderClass[accentColor]} p-5 flex flex-col`}
    >
      <div
        className={`text-sm font-medium text-primary mb-2 ${titleRight != null ? 'relative z-20' : ''}`}
      >
        {/* Row 1: title (and optional titleRight e.g. period dropdown). Row 2: period — same layout for all cards. */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {titleIcon}
            <span className="text-xs md:text-sm 2xl:text-base font-semibold text-secondary">{title}</span>
          </div>
          {titleRight != null && <div className="relative z-20 flex-shrink-0">{titleRight}</div>}
        </div>
        {!loading && timePeriod != null && (
          <p className="text-[10px] md:text-xs 2xl:text-sm font-normal text-primary mt-0.5">({timePeriod})</p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#DBE0E5] bg-[#F8F9FA] px-3 py-2 min-h-[3.5rem]">
        {loading ? (
          <div className="flex items-center justify-center flex-1 py-2">
            <Spinner size="md" className="text-button-primary" />
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-shrink-0">
              <p className={`text-lg md:text-xl 2xl:text-2xl font-semibold ${valueClassName}`}>{value}</p>
              {valueFooter != null && (
                <p className="text-[10px] md:text-xs 2xl:text-sm font-normal text-primary mt-0.5">
                  {valueFooter}
                </p>
              )}
            </div>
            {hasRightContent && <div className="flex-shrink-0 min-w-0">{renderRightContent()}</div>}
          </>
        )}
      </div>
    </div>
  );
};

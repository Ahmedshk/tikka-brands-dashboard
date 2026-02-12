import { ReactNode } from 'react';

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
  /** Optional chip on the right inside value container (e.g. "272 Reviews") */
  extra?: string;
  /** Optional class for the extra chip (e.g. bg-yellow-100 text-gray-700) */
  extraClassName?: string;
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
  extra,
  extraClassName = defaultExtraClassName,
}: KPICardProps) => {
  const hasRightContent = rightIcon != null || badge != null || subtitle != null || extra != null;

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
          {subtitle != null && <span className="text-base md:text-lg 2xl:text-xl font-medium text-primary">{subtitle}</span>}
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
      className={`bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden border-l-8 ${accentBorderClass[accentColor]} p-5 flex flex-col`}
    >
      <p className="text-sm font-medium text-primary mb-2 flex items-center gap-2 flex-wrap">
        {titleIcon}
        <span className='text-xs md:text-sm 2xl:text-base font-semibold text-secondary'>{title}</span>
        {timePeriod != null && (
          <span className="text-[10px] md:text-xs 2xl:text-sm font-normal text-primary">({timePeriod})</span>
        )}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#DBE0E5] bg-[#F8F9FA] px-3 py-2">
        <p className={`text-xl md:text-2xl 2xl:text-[26px] font-semibold min-w-0 flex-shrink-0 ${valueClassName}`}>{value}</p>
        {hasRightContent && <div className="flex-shrink-0 min-w-0">{renderRightContent()}</div>}
      </div>
    </div>
  );
};

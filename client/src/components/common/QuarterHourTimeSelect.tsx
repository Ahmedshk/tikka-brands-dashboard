import { useEffect, useMemo } from 'react';
import { Dropdown, type DropdownOption } from './Dropdown';
import {
  QUARTER_HOUR_HH_MM,
  QUARTER_HOUR_SET,
  formatHmAs12h,
  snapHmToQuarterHour,
} from '../../utils/quarterHourTimeOptions';

const QUARTER_HOUR_OPTIONS: DropdownOption[] = QUARTER_HOUR_HH_MM.map((hm) => ({
  value: hm,
  label: formatHmAs12h(hm),
}));

export interface QuarterHourTimeSelectProps {
  /** HH:mm (24h); coerced to nearest quarter-hour when not on the grid. */
  value: string;
  onChange: (hhmm: string) => void;
  fallbackTime?: string;
  /** id of visible label element (caption above control). */
  labelledBy?: string;
  className?: string;
  /** Match navbar location dropdown list position when near bottom of a modal. */
  openAbove?: boolean;
  /**
   * When set, only these HH:mm values appear (e.g. end time after start on the same day).
   * Omit for the full quarter-hour day.
   */
  allowedValues?: readonly string[];
}

export function QuarterHourTimeSelect({
  value,
  onChange,
  fallbackTime = '09:00',
  labelledBy,
  className,
  openAbove = false,
  allowedValues,
}: Readonly<QuarterHourTimeSelectProps>) {
  const fallback = QUARTER_HOUR_SET.has(fallbackTime) ? fallbackTime : '09:00';
  const effective = useMemo(() => {
    const v = value.trim();
    const snapped = v && QUARTER_HOUR_SET.has(v) ? v : snapHmToQuarterHour(value, fallback);
    if (allowedValues == null || allowedValues.length === 0) return snapped;
    if (allowedValues.includes(snapped)) return snapped;
    return allowedValues[0] ?? snapped;
  }, [value, fallback, allowedValues]);

  useEffect(() => {
    if (!value.trim()) return;
    const snapped = snapHmToQuarterHour(value, fallback);
    if (snapped !== value) {
      onChange(snapped);
      return;
    }
    if (allowedValues != null && allowedValues.length > 0 && !allowedValues.includes(snapped)) {
      onChange(allowedValues[0]!);
    }
  }, [value, fallback, onChange, allowedValues]);

  const dropdownOptions = useMemo(() => {
    if (allowedValues == null || allowedValues.length === 0) return QUARTER_HOUR_OPTIONS;
    return allowedValues.map((hm) => ({ value: hm, label: formatHmAs12h(hm) }));
  }, [allowedValues]);

  return (
    <Dropdown
      options={dropdownOptions}
      value={effective}
      onChange={onChange}
      placeholder="Time"
      aria-label="Select time"
      aria-labelledby={labelledBy}
      allowEmpty={false}
      openAbove={openAbove}
      className={className ?? 'w-full'}
      triggerLabel={
        <span className="text-xs md:text-sm 2xl:text-base text-primary truncate">
          {formatHmAs12h(effective)}
        </span>
      }
    />
  );
}

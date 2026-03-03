import React, { useMemo, useState, useCallback } from 'react';
import { parse, format, addDays } from 'date-fns';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import type { PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import Popover from '@mui/material/Popover';

function toMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function toDate(day: unknown): Date | null {
  if (day == null) return null;
  if (day instanceof Date) return day;
  if (typeof (day as { toJsDate?: () => Date }).toJsDate === 'function')
    return (day as { toJsDate: () => Date }).toJsDate();
  if (typeof (day as { getTime?: () => number }).getTime === 'function')
    return new Date((day as { getTime: () => number }).getTime());
  return null;
}

function parseISODate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = parse(iso, 'yyyy-MM-dd', new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Get Sunday of the week containing the given date. */
function getSundayOfDate(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function formatToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WEEK_BG = 'rgba(25, 118, 210, 0.12)';

function getRangeBorderRadius(isStart: boolean, isEnd: boolean): string {
  if (isStart && isEnd) return '50%';
  if (isStart) return '50% 0 0 50%';
  if (isEnd) return '0 50% 50% 0';
  return '0';
}

/** Custom day that highlights the full week (Sun–Sat) when a week is selected. */
function createWeekDay(
  weekStartDate: string | null
): React.ComponentType<PickersDayProps<Date>> {
  const rangeStart = weekStartDate ? parseISODate(weekStartDate) : null;
  const rangeEnd = rangeStart
    ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 6)
    : null;
  const startTime = rangeStart ? toMidnight(rangeStart) : 0;
  const endTime = rangeEnd ? toMidnight(rangeEnd) : 0;

  return function WeekDay(props: PickersDayProps<Date>) {
    const { day, sx, style, ...rest } = props;
    const dayDate = toDate(day);
    if (!dayDate || !rangeStart || !rangeEnd) {
      return <PickersDay {...rest} day={day} sx={sx} style={style} />;
    }
    const dayTime = toMidnight(dayDate);
    const isStart = dayTime === startTime;
    const isEnd = dayTime === endTime;
    const isInRange = dayTime >= startTime && dayTime <= endTime;
    if (!isStart && !isEnd && !isInRange) {
      return <PickersDay {...rest} day={day} sx={sx} style={style} />;
    }
    const rangeStyle: React.CSSProperties = {
      backgroundColor: WEEK_BG,
      borderRadius: getRangeBorderRadius(isStart, isEnd),
      margin: 0,
    };
    if (isStart || isEnd) {
      rangeStyle.border = '2px solid rgba(25, 118, 210, 0.6)';
      rangeStyle.boxSizing = 'border-box';
    }
    return (
      <PickersDay
        {...rest}
        day={day}
        selected={false}
        disableMargin
        sx={sx}
        style={{ ...style, ...rangeStyle }}
      />
    );
  };
}

export interface WeekPickerCalendarProps {
  /** Sunday of the selected week (YYYY-MM-DD), or null */
  value: string | null;
  onChange: (weekStartSunday: string) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Week start dates (YYYY-MM-DD) to disable; any day in those weeks will be disabled */
  disabledWeekStarts?: string[];
  id?: string;
  className?: string;
}

export function WeekPickerCalendar({
  value,
  onChange,
  minDate,
  maxDate,
  disabledWeekStarts = [],
  id,
  className = '',
}: WeekPickerCalendarProps) {
  const calendarValue = useMemo(() => {
    if (!value) return null;
    const d = parseISODate(value);
    return d;
  }, [value]);

  const handleChange = (date: Date | null) => {
    if (!date) return;
    const sunday = getSundayOfDate(date);
    onChange(formatToISO(sunday));
  };

  const slots = useMemo(() => {
    const DayComponent = createWeekDay(value);
    return { day: DayComponent };
  }, [value]);

  const disabledSet = useMemo(
    () => new Set(disabledWeekStarts),
    [disabledWeekStarts]
  );
  const shouldDisableDate = useCallback(
    (date: Date) => {
      if (disabledSet.size === 0) return false;
      const sunday = getSundayOfDate(date);
      const sundayISO = formatToISO(sunday);
      return disabledSet.has(sundayISO);
    },
    [disabledSet]
  );

  return (
    <div id={id} className={className}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <DateCalendar
          value={calendarValue}
          onChange={handleChange}
          minDate={minDate}
          maxDate={maxDate}
          shouldDisableDate={shouldDisableDate}
          showDaysOutsideCurrentMonth
          slots={slots}
          sx={(theme) => ({
            [theme.breakpoints.down('sm')]: { height: 260 },
          })}
        />
      </LocalizationProvider>
    </div>
  );
}

/** Format Sunday YYYY-MM-DD as "mm/dd/yyyy – mm/dd/yyyy" (Sun – Sat). */
function formatWeekRangeLabel(sundayISO: string): string {
  const start = parseISODate(sundayISO);
  if (!start) return sundayISO;
  const end = addDays(start, 6);
  return `${format(start, 'MM/dd/yyyy')} – ${format(end, 'MM/dd/yyyy')}`;
}

export interface WeekPickerPopoverProps {
  /** Sunday of the selected week (YYYY-MM-DD), or null */
  value: string | null;
  onChange: (weekStartSunday: string) => void;
  minDate?: Date;
  maxDate?: Date;
  id?: string;
  /** Placeholder when no week selected */
  placeholder?: string;
  /** Label for the trigger (e.g. "Select week" or "Week (Sunday)") */
  label?: string;
  className?: string;
}

type WeekPickerPopoverPropsReadonly = Readonly<WeekPickerPopoverProps>;

/**
 * Week picker that opens the calendar in a popover menu instead of inline.
 * Use when space is limited (e.g. Future weeks, Previous goals).
 */
export function WeekPickerPopover({
  value,
  onChange,
  minDate,
  maxDate,
  id,
  placeholder = 'Select week',
  label,
  className = '',
}: WeekPickerPopoverPropsReadonly) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const handleOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleChange = useCallback(
    (weekStartSunday: string) => {
      onChange(weekStartSunday);
      setAnchorEl(null);
    },
    [onChange]
  );

  const displayText = value ? formatWeekRangeLabel(value) : placeholder;

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={handleOpen}
        className={`inline-flex items-center justify-between gap-2 min-w-[200px] max-w-full px-3 py-2 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm text-left text-primary hover:bg-gray-100 transition-colors ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate">{displayText}</span>
        <span className="shrink-0 text-gray-500" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: { mt: 1.5, borderRadius: 2 },
          },
        }}
      >
        <div className="p-2">
          {label && (
            <p className="text-sm font-medium text-primary px-2 py-1 mb-1">
              {label}
            </p>
          )}
          <WeekPickerCalendar
            value={value}
            onChange={handleChange}
            minDate={minDate}
            maxDate={maxDate}
          />
        </div>
      </Popover>
    </>
  );
}

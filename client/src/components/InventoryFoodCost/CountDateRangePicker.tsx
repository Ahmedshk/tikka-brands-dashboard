import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, parse } from 'date-fns';
import Popover from '@mui/material/Popover';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import type { PickersDayProps } from '@mui/x-date-pickers/PickersDay';

const DISPLAY_FORMAT = 'MM/dd/yyyy';
const ISO_FORMAT = 'yyyy-MM-dd';

function toDate(day: unknown): Date | null {
  if (day == null) return null;
  if (day instanceof Date) return day;
  if (typeof (day as { toJsDate?: () => Date }).toJsDate === 'function')
    return (day as { toJsDate: () => Date }).toJsDate();
  return null;
}

function toMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dateToISO(d: Date): string {
  return format(d, ISO_FORMAT);
}

function parseISO(s: string | undefined): Date | null {
  if (!s || typeof s !== 'string') return null;
  const d = parse(s.slice(0, 10), ISO_FORMAT, new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Create a day component for the start calendar: valid start dates get green outline; invalid or after selected end are disabled. Selected date fill #5DC54F. */
function createStartDay(
  validStartSet: Set<string>,
  selectedEnd: string | null,
  selectedStart: string | null
): React.ComponentType<PickersDayProps> {
  const endTime = selectedEnd ? toMidnight(parseISO(selectedEnd)!) : 0;
  return function StartDay(props: PickersDayProps) {
    const { day, sx, style, disabled, ...rest } = props;
    const dayDate = toDate(day);
    if (!dayDate) return <PickersDay {...props} />;
    const iso = dateToISO(dayDate);
    const isValid = validStartSet.has(iso);
    const afterEnd = selectedEnd && toMidnight(dayDate) > endTime;
    const isDisabled = disabled || !isValid || afterEnd;
    const isSelected = selectedStart === iso;
    let ringColor: string | undefined;
    if (isValid) ringColor = afterEnd ? '#9e9e9e' : '#5DC54F';
    else ringColor = undefined;
    const outlineStyle: React.CSSProperties = ringColor
      ? { border: `2px solid ${ringColor}`, boxSizing: 'border-box', borderRadius: '50%' }
      : {};
    const fillStyle: React.CSSProperties = isSelected
      ? { backgroundColor: '#5DC54F', borderRadius: '50%' }
      : {};
    return (
      <PickersDay
        {...rest}
        day={day}
        disabled={Boolean(isDisabled)}
        sx={sx}
        style={{ ...style, ...outlineStyle, ...fillStyle }}
      />
    );
  };
}

/** Create a day component for the end calendar: valid end dates get blue outline (always); invalid or before selected start are disabled. Selected date fill #009BBE. */
function createEndDay(
  validEndSet: Set<string>,
  selectedStart: string | null,
  selectedEnd: string | null
): React.ComponentType<PickersDayProps> {
  const startTime = selectedStart ? toMidnight(parseISO(selectedStart)!) : 0;
  return function EndDay(props: PickersDayProps) {
    const { day, sx, style, disabled, ...rest } = props;
    const dayDate = toDate(day);
    if (!dayDate) return <PickersDay {...props} />;
    const iso = dateToISO(dayDate);
    const isValid = validEndSet.has(iso);
    const beforeStart = selectedStart && toMidnight(dayDate) < startTime;
    const isDisabled = disabled || !isValid || beforeStart;
    const isSelected = selectedEnd === iso;
    let ringColor: string | undefined;
    if (isValid) ringColor = beforeStart ? '#9e9e9e' : '#009BBE';
    else ringColor = undefined;
    const outlineStyle: React.CSSProperties = ringColor
      ? { border: `2px solid ${ringColor}`, boxSizing: 'border-box', borderRadius: '50%' }
      : {};
    const fillStyle: React.CSSProperties = isSelected
      ? { backgroundColor: '#009BBE', borderRadius: '50%' }
      : {};
    return (
      <PickersDay
        {...rest}
        day={day}
        disabled={Boolean(isDisabled)}
        sx={sx}
        style={{ ...style, ...outlineStyle, ...fillStyle }}
      />
    );
  };
}

export interface CountDateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  validStartDates: string[];
  validEndDates: string[];
  onChange: (start: string | null, end: string | null) => void;
  onClose: () => void;
  open: boolean;
  anchorEl: HTMLElement | null;
  /** Called when popover requests to close (e.g. Cancel or backdrop). */
  onRequestClose: () => void;
}

export function CountDateRangePicker({
  startDate,
  endDate,
  validStartDates,
  validEndDates,
  onChange,
  onClose,
  open,
  anchorEl,
  onRequestClose,
}: Readonly<CountDateRangePickerProps>) {
  const [localStart, setLocalStart] = useState<string | null>(startDate);
  const [localEnd, setLocalEnd] = useState<string | null>(endDate);

  useEffect(() => {
    if (open) {
      setLocalStart(startDate);
      setLocalEnd(endDate);
    }
  }, [open, startDate, endDate]);

  const validStartSet = useMemo(() => new Set(validStartDates), [validStartDates]);
  const validEndSet = useMemo(() => new Set(validEndDates), [validEndDates]);

  const startSlots = useMemo(
    () => ({ day: createStartDay(validStartSet, localEnd, localStart) }),
    [validStartSet, localEnd, localStart]
  );
  const endSlots = useMemo(
    () => ({ day: createEndDay(validEndSet, localStart, localEnd) }),
    [validEndSet, localStart, localEnd]
  );

  const handleStartChange = useCallback((date: Date | null) => {
    if (!date) return;
    const iso = dateToISO(date);
    if (validStartSet.has(iso)) setLocalStart(iso);
  }, [validStartSet]);

  const handleEndChange = useCallback((date: Date | null) => {
    if (!date) return;
    const iso = dateToISO(date);
    if (validEndSet.has(iso)) setLocalEnd(iso);
  }, [validEndSet]);

  const handleConfirm = () => {
    if (localStart && localEnd && localStart <= localEnd) {
      onChange(localStart, localEnd);
    }
    onRequestClose();
    onClose();
  };

  const handleCancel = () => {
    onRequestClose();
    onClose();
  };

  const canConfirm = Boolean(
    localStart && localEnd && localStart <= localEnd
  );

  return (
    <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={onRequestClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 'min(95vw, 640px)',
              '@media (max-width: 640px)': {
                position: 'fixed',
                left: '50% !important',
                top: '50% !important',
                transform: 'translate(-50%, -50%) !important',
                margin: 0,
                width: '95vw',
                maxWidth: '95vw',
                maxHeight: '90vh',
              },
            },
          },
        }}
      >
        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold text-secondary mb-2">
                Start date :
              </p>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DateCalendar
                  value={localStart ? parseISO(localStart) : null}
                  onChange={handleStartChange}
                  slots={startSlots}
                  showDaysOutsideCurrentMonth
                  sx={{ height: 280 }}
                />
              </LocalizationProvider>
            </div>
            <div>
              <p className="text-sm font-semibold text-secondary mb-2">
                End date :
              </p>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DateCalendar
                  value={localEnd ? parseISO(localEnd) : null}
                  onChange={handleEndChange}
                  slots={endSlots}
                  showDaysOutsideCurrentMonth
                  sx={{ height: 280 }}
                />
              </LocalizationProvider>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-secondary">
            <span className="flex items-center gap-2">
              <span
                className="inline-block w-5 h-5 rounded-full border-2 border-[#5DC54F] bg-transparent"
                aria-hidden
              />
              <span>Valid count available for start date</span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="inline-block w-5 h-5 rounded-full border-2 border-[#009BBE] bg-transparent"
                aria-hidden
              />
              <span>Valid count available for end date</span>
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-primary text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm
            </button>
          </div>
          <p className="flex items-start gap-2 text-xs text-secondary">
            <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-gray-400 text-white flex items-center justify-center text-[10px] font-bold">
              i
            </span>
            <span>
              The calendar displays dates valid for variance analysis, based on
              available inventory counts. Note that a day-end count makes the
              following day relevant for starting date, and a day-start count
              makes the previous day relevant for end of period.
            </span>
          </p>
        </div>
      </Popover>
  );
}

/** Trigger button that shows the current range and opens the picker. */
export function CountDateRangePickerTrigger({
  startDate,
  endDate,
  onClick,
  disabled,
  className = '',
}: Readonly<{
  startDate: string | null;
  endDate: string | null;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  className?: string;
}>) {
  const displayLabel =
    startDate && endDate
      ? `${format(parseISO(startDate)!, DISPLAY_FORMAT)} - ${format(parseISO(endDate)!, DISPLAY_FORMAT)}`
      : 'Select date range';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-left text-sm text-primary bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300/50 disabled:opacity-70 disabled:cursor-not-allowed min-w-[200px] ${className}`}
      aria-haspopup="dialog"
      aria-expanded={false}
    >
      <span className="flex-1 truncate">{displayLabel}</span>
      <svg
        className="w-4 h-4 flex-shrink-0 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </button>
  );
}

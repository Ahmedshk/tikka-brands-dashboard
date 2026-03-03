import { useState, useRef, useEffect, useMemo } from 'react';
import { format, parse } from 'date-fns';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import TextField from '@mui/material/TextField';
import { createRangeDay, parseISODateToLocal } from './rangeDaySlot';
import type { SalesTrendPeriodType } from '../../services/commandCenter.service';

export const PERIOD_OPTIONS: { value: SalesTrendPeriodType; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last7days', label: 'Last 7 days' },
  { value: 'last30days', label: 'Last 30 days' },
  { value: 'last52weeks', label: 'Last 52 weeks' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'thisYear', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

const DATE_DISPLAY_FORMAT = 'MM/dd/yy';

export interface PeriodPickerValue {
  periodType: SalesTrendPeriodType;
  periodStart?: string;
  periodEnd?: string;
}

export interface PeriodPickerProps {
  value: PeriodPickerValue;
  onChange: (value: PeriodPickerValue) => void;
  /** Optional id for the trigger button */
  id?: string;
  className?: string;
}

function parseDateSafe(s: string | undefined): Date | null {
  if (!s) return null;
  const d = parse(s, DATE_DISPLAY_FORMAT, new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateToISO(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Compare two dates by calendar day (ignore time). */
function isSameOrAfter(date: Date, start: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  return d >= s;
}

export function PeriodPicker({ value, onChange, id, className = '' }: PeriodPickerProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const toDisplay = (iso: string) => {
    try {
      return format(parse(iso, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
    } catch {
      return '';
    }
  };
  const [localStart, setLocalStart] = useState<string>('');
  const [localEnd, setLocalEnd] = useState<string>('');
  const calendarDateRef = useRef<Date>(new Date());
  const pickingRef = useRef<'start' | 'end'>('start');

  useEffect(() => {
    if (value.periodType === 'custom' && pickingRef.current !== 'end') {
      setLocalStart(value.periodStart ? toDisplay(value.periodStart) : '');
      setLocalEnd(value.periodEnd ? toDisplay(value.periodEnd) : '');
    }
  }, [value.periodType, value.periodStart, value.periodEnd]);

  const open = Boolean(anchorEl);
  const isCustom = value.periodType === 'custom';

  const localStartDate = parseDateSafe(localStart);
  const localEndDate = parseDateSafe(localEnd);
  const isPicking = pickingRef.current === 'end';
  const rangeStart = localStartDate ?? (isPicking ? null : parseISODateToLocal(value.periodStart));
  const rangeEnd = localEndDate ?? (isPicking ? null : parseISODateToLocal(value.periodEnd));
  const slots = useMemo(() => {
    if (rangeStart != null && rangeEnd != null) {
      return { day: createRangeDay(rangeStart, rangeEnd) };
    }
    if (rangeStart != null) {
      return { day: createRangeDay(rangeStart, rangeStart) };
    }
    return undefined;
  }, [rangeStart?.getTime(), rangeEnd?.getTime()]);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
    pickingRef.current = 'start';
  };
  const handleClose = () => {
    setAnchorEl(null);
    pickingRef.current = 'start';
    if (isCustom && localStart && localEnd) {
      const start = parseDateSafe(localStart);
      const end = parseDateSafe(localEnd);
      if (start && end) {
        onChange({
          periodType: 'custom',
          periodStart: formatDateToISO(start),
          periodEnd: formatDateToISO(end),
        });
      }
    } else if (isCustom && localStart && !localEnd) {
      setLocalStart(value.periodStart ? toDisplay(value.periodStart) : '');
      setLocalEnd(value.periodEnd ? toDisplay(value.periodEnd) : '');
    }
  };

  const handleSelectPeriod = (periodType: SalesTrendPeriodType) => {
    if (periodType === 'custom') {
      const start = parseDateSafe(localStart);
      const end = parseDateSafe(localEnd);
      onChange({
        periodType: 'custom',
        periodStart: start ? formatDateToISO(start) : undefined,
        periodEnd: end ? formatDateToISO(end) : undefined,
      });
      // Keep menu open so user can pick start/end dates; close happens in handleCalendarChange or handleEndBlur when both dates set
    } else {
      setLocalStart('');
      setLocalEnd('');
      pickingRef.current = 'start';
      onChange({ periodType });
      setAnchorEl(null);
    }
  };

  const handleCalendarChange = (date: Date | null) => {
    if (!date) return;
    calendarDateRef.current = date;
    const str = format(date, DATE_DISPLAY_FORMAT);
    const dateIso = formatDateToISO(date);
    const currentStart = parseDateSafe(localStart);

    if (pickingRef.current === 'start' || !currentStart) {
      setLocalStart(str);
      setLocalEnd('');
      pickingRef.current = 'end';
      return;
    }

    if (!isSameOrAfter(date, currentStart)) {
      setLocalStart(str);
      setLocalEnd('');
    } else {
      setLocalEnd(str);
      pickingRef.current = 'start';
      onChange({
        periodType: 'custom',
        periodStart: formatDateToISO(currentStart),
        periodEnd: dateIso,
      });
      setAnchorEl(null);
    }
  };

  const handleStartBlur = () => {
    const d = parseDateSafe(localStart);
    if (d) onChange({ ...value, periodStart: formatDateToISO(d) });
  };
  const handleEndBlur = () => {
    const d = parseDateSafe(localEnd);
    if (d) {
      onChange({ ...value, periodEnd: formatDateToISO(d) });
      if (parseDateSafe(localStart)) setAnchorEl(null);
    }
  };

  const displayLabel = (() => {
    if (value.periodType === 'custom' && value.periodStart && value.periodEnd) {
      try {
        const s = format(parse(value.periodStart, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
        const e = format(parse(value.periodEnd, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
        return s === e ? s : `${s} – ${e}`;
      } catch {
        return 'Custom';
      }
    }
    return PERIOD_OPTIONS.find((o) => o.value === value.periodType)?.label ?? 'Period';
  })();

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={handleOpen}
        className={`border border-gray-300 rounded-lg px-3 py-2 text-sm text-primary bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-quaternary/30 ${className}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {displayLabel}
      </button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: (theme) => ({
              width: 'calc(100vw - 24px)',
              maxWidth: 'calc(100vw - 24px)',
              maxHeight: 'calc(100vh - 24px)',
              overflow: 'hidden',
              [theme.breakpoints.up('sm')]: {
                width: 'auto',
                maxWidth: 'none',
                maxHeight: 'none',
                overflow: 'visible',
              },
            }),
          },
        }}
      >
        <div className="flex flex-col sm:flex-row min-w-0">
          <div className="border-b border-gray-200 sm:border-b-0 sm:border-r shrink-0">
            <List
              dense
              sx={(theme) => ({
                py: 0,
                [theme.breakpoints.down('sm')]: {
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                },
              })}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <ListItemButton
                  key={opt.value}
                  selected={value.periodType === opt.value}
                  onClick={() => handleSelectPeriod(opt.value)}
                  sx={{
                    bgcolor: value.periodType === opt.value ? 'action.selected' : undefined,
                  }}
                >
                  <ListItemText primary={opt.label} primaryTypographyProps={{ fontSize: 14 }} />
                </ListItemButton>
              ))}
            </List>
          </div>
          <div className="p-2 sm:p-3 flex flex-col gap-1 sm:gap-2 min-w-0 flex-1 justify-center items-center">
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <div className="w-full overflow-hidden flex justify-center max-h-[230px] sm:max-h-none">
                <div className="inline-block scale-[0.85] origin-top sm:scale-100 sm:origin-center">
                  <DateCalendar
                    value={
                      localEnd
                        ? parseDateSafe(localEnd) ?? calendarDateRef.current
                        : parseDateSafe(localStart) ?? calendarDateRef.current
                    }
                    onChange={handleCalendarChange}
                    minDate={new Date(2020, 0, 1)}
                    maxDate={new Date()}
                    slots={slots}
                    sx={(theme) => ({
                      [theme.breakpoints.down('sm')]: {
                        height: 240,
                      },
                    })}
                  />
                </div>
              </div>
            </LocalizationProvider>
            {isCustom && (
              <div className="flex flex-row gap-2 w-full">
                <TextField
                  size="small"
                  label="Start date"
                  value={localStart}
                  onChange={(e) => setLocalStart(e.target.value)}
                  onBlur={handleStartBlur}
                  placeholder={DATE_DISPLAY_FORMAT}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="End date"
                  value={localEnd}
                  onChange={(e) => setLocalEnd(e.target.value)}
                  onBlur={handleEndBlur}
                  placeholder={DATE_DISPLAY_FORMAT}
                  fullWidth
                />
              </div>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}

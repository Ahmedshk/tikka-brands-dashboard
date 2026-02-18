import { useState, useEffect, useMemo, useRef } from 'react';
import { format, parse, addDays, addYears, differenceInCalendarDays } from 'date-fns';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import TextField from '@mui/material/TextField';
import { createRangeDay, parseISODateToLocal } from './rangeDaySlot';
import type {
  SalesTrendComparisonType,
  SalesTrendPeriodType,
} from '../../services/commandCenter.service';
import type { PeriodPickerValue } from './PeriodPicker';

const DATE_DISPLAY_FORMAT = 'MM/dd/yyyy';

/**
 * End date of comparison range when only start is chosen.
 * For custom periods, pass the number of days in the period range.
 */
function getComparisonEndFromStart(
  startIso: string,
  periodType: SalesTrendPeriodType,
  customRangeDays?: number,
): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return startIso;
  if (periodType === 'today') return startIso;
  if (periodType === 'last7days' || periodType === 'thisWeek') {
    return format(addDays(start, 6), 'yyyy-MM-dd');
  }
  if (periodType === 'last30days' || periodType === 'thisMonth') {
    return format(addDays(start, 29), 'yyyy-MM-dd');
  }
  if (periodType === 'last52weeks') {
    return format(addDays(start, 363), 'yyyy-MM-dd');
  }
  if (periodType === 'thisYear') {
    return format(addYears(start, 1), 'yyyy-MM-dd');
  }
  if (periodType === 'custom') {
    const days = customRangeDays != null && customRangeDays >= 0 ? customRangeDays : 29;
    return format(addDays(start, days), 'yyyy-MM-dd');
  }
  return startIso;
}

export function getComparisonOptionsForPeriod(
  periodType: SalesTrendPeriodType,
): { value: SalesTrendComparisonType; label: string }[] {
  const currentYear = new Date().getFullYear();
  switch (periodType) {
    case 'today':
      return [
        { value: 'none', label: 'None' },
        { value: '1DayPrior', label: 'Yesterday' },
        { value: 'samePeriodPreviousWeek', label: 'Same period previous week' },
        { value: 'samePeriodPreviousMonth', label: 'Same period previous month' },
        { value: 'priorYear', label: 'Same period previous year' },
        { value: 'custom', label: 'Custom' },
      ];
    case 'last7days':
      return [
        { value: 'none', label: 'None' },
        { value: 'samePeriodPreviousWeek', label: '7 days prior' },
        { value: 'samePeriodPreviousMonth', label: 'Same period previous month' },
        { value: 'priorYear', label: 'Prior year' },
        { value: 'custom', label: 'Custom' },
      ];
    case 'last30days':
      return [
        { value: 'none', label: 'None' },
        { value: 'samePeriodPreviousMonth', label: 'Same period previous month' },
        { value: 'priorYear', label: 'Same period previous year' },
        { value: 'custom', label: 'Custom' },
      ];
    case 'last52weeks':
      return [
        { value: 'none', label: 'None' },
        { value: '52WeeksPrior', label: '52 weeks prior' },
        { value: 'year2Before', label: `Year ${currentYear - 2}` },
        { value: 'year3Before', label: `Year ${currentYear - 3}` },
        { value: 'year4Before', label: `Year ${currentYear - 4}` },
        { value: 'custom', label: 'Custom' },
      ];
    case 'thisWeek':
      return [
        { value: 'none', label: 'None' },
        { value: 'samePeriodPreviousWeek', label: '7 days prior' },
        { value: 'samePeriodPreviousMonth', label: 'Same period previous month' },
        { value: 'priorYear', label: 'Previous year' },
        { value: 'custom', label: 'Custom' },
      ];
    case 'thisMonth':
      return [
        { value: 'none', label: 'None' },
        { value: 'samePeriodPreviousMonth', label: 'Same period previous month' },
        { value: 'priorYear', label: 'Prior year' },
        { value: 'custom', label: 'Custom' },
      ];
    case 'thisYear':
      return [
        { value: 'none', label: 'None' },
        { value: 'priorYear', label: 'Same period previous year' },
        { value: 'year2Before', label: `Year ${currentYear - 2}` },
        { value: 'year3Before', label: `Year ${currentYear - 3}` },
        { value: 'year4Before', label: `Year ${currentYear - 4}` },
        { value: 'custom', label: 'Custom' },
      ];
    case 'custom':
    default:
      return [
        { value: 'none', label: 'None' },
        { value: 'samePeriodPreviousMonth', label: 'Same period previous month' },
        { value: 'priorYear', label: 'Prior year' },
        { value: 'custom', label: 'Custom' },
      ];
  }
}

export interface ComparisonPeriodPickerValue {
  comparisonType: SalesTrendComparisonType;
  comparisonDate?: string;
  comparisonStart?: string;
  comparisonEnd?: string;
}

export interface ComparisonPeriodPickerProps {
  value: ComparisonPeriodPickerValue;
  onChange: (value: ComparisonPeriodPickerValue) => void;
  period: PeriodPickerValue;
  /** Exclude these comparison types from the options list (e.g. ['none'] for KPI table) */
  excludeComparisonTypes?: SalesTrendComparisonType[];
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

export function ComparisonPeriodPicker({
  value,
  onChange,
  period,
  excludeComparisonTypes,
  id,
  className = '',
}: ComparisonPeriodPickerProps) {
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
  const pickingRef = useRef<'start' | 'end'>('start');

  const periodType = period.periodType;
  const comparisonOptions = useMemo(() => {
    const opts = getComparisonOptionsForPeriod(periodType);
    if (!excludeComparisonTypes?.length) return opts;
    const set = new Set(excludeComparisonTypes);
    return opts.filter((o) => !set.has(o.value));
  }, [periodType, excludeComparisonTypes]);

  const customRangeDays = useMemo(() => {
    if (periodType !== 'custom' || !period.periodStart || !period.periodEnd) return undefined;
    const s = parseISODateToLocal(period.periodStart);
    const e = parseISODateToLocal(period.periodEnd);
    if (!s || !e) return undefined;
    return differenceInCalendarDays(e, s);
  }, [periodType, period.periodStart, period.periodEnd]);

  const autoEndDate = periodType !== 'custom' || customRangeDays != null;

  useEffect(() => {
    if (value.comparisonType === 'custom' && pickingRef.current !== 'end') {
      setLocalStart(value.comparisonStart ? toDisplay(value.comparisonStart) : '');
      setLocalEnd(value.comparisonEnd ? toDisplay(value.comparisonEnd) : '');
    }
  }, [value.comparisonType, value.comparisonStart, value.comparisonEnd]);

  useEffect(() => {
    if (value.comparisonType !== 'custom' || !value.comparisonStart) return;
    if (!autoEndDate) return;
    const newEnd = getComparisonEndFromStart(value.comparisonStart, periodType, customRangeDays);
    if (newEnd !== value.comparisonEnd) {
      setLocalEnd(toDisplay(newEnd));
      onChange({
        ...value,
        comparisonEnd: newEnd,
      });
    }
  }, [periodType, customRangeDays]);

  const open = Boolean(anchorEl);
  const isCustom = value.comparisonType === 'custom';

  const localStartDate = parseDateSafe(localStart);
  const localEndDate = parseDateSafe(localEnd);
  const isPicking = pickingRef.current === 'end';
  const rangeStart = localStartDate ?? (isPicking ? null : parseISODateToLocal(value.comparisonStart));
  const rangeEnd = localEndDate ?? (isPicking ? null : parseISODateToLocal(value.comparisonEnd));
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
      const startD = parseDateSafe(localStart);
      const endD = parseDateSafe(localEnd);
      if (startD && endD) {
        onChange({
          comparisonType: 'custom',
          comparisonStart: formatDateToISO(startD),
          comparisonEnd: formatDateToISO(endD),
        });
      }
    } else if (isCustom && localStart && !localEnd) {
      setLocalStart(value.comparisonStart ? toDisplay(value.comparisonStart) : '');
      setLocalEnd(value.comparisonEnd ? toDisplay(value.comparisonEnd) : '');
    }
  };

  const handleSelectComparison = (comparisonType: SalesTrendComparisonType) => {
    if (comparisonType === 'custom') {
      const startD = parseDateSafe(localStart);
      if (startD) {
        const startIso = formatDateToISO(startD);
        const endIso = autoEndDate
          ? getComparisonEndFromStart(startIso, periodType, customRangeDays)
          : (() => {
            const endD = parseDateSafe(localEnd);
            return endD && isSameOrAfter(endD, startD)
              ? formatDateToISO(endD)
              : getComparisonEndFromStart(startIso, periodType, customRangeDays);
          })();
        onChange({
          comparisonType: 'custom',
          comparisonStart: startIso,
          comparisonEnd: endIso,
        });
      } else {
        onChange({ comparisonType: 'custom' });
      }
    } else {
      onChange({ comparisonType });
    }
  };

  const handleCalendarChange = (date: Date | null) => {
    if (!date) return;
    const str = format(date, DATE_DISPLAY_FORMAT);
    const dateIso = formatDateToISO(date);

    if (autoEndDate) {
      const endIso = getComparisonEndFromStart(dateIso, periodType, customRangeDays);
      setLocalStart(str);
      setLocalEnd(toDisplay(endIso));
      onChange({
        comparisonType: 'custom',
        comparisonStart: dateIso,
        comparisonEnd: endIso,
      });
      return;
    }

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
        comparisonType: 'custom',
        comparisonStart: formatDateToISO(currentStart),
        comparisonEnd: dateIso,
      });
    }
  };

  const handleStartBlur = () => {
    const startD = parseDateSafe(localStart);
    if (startD) {
      const startIso = formatDateToISO(startD);
      const endIso = autoEndDate
        ? getComparisonEndFromStart(startIso, periodType, customRangeDays)
        : (() => {
          const endD = parseDateSafe(localEnd);
          return endD && isSameOrAfter(endD, startD)
            ? formatDateToISO(endD)
            : getComparisonEndFromStart(startIso, periodType, customRangeDays);
        })();
      onChange({
        ...value,
        comparisonStart: startIso,
        comparisonEnd: endIso,
      });
    }
  };

  const handleEndBlur = () => {
    if (autoEndDate) return;
    const startD = parseDateSafe(localStart);
    const endD = parseDateSafe(localEnd);
    if (startD && endD && isSameOrAfter(endD, startD)) {
      onChange({
        ...value,
        comparisonStart: formatDateToISO(startD),
        comparisonEnd: formatDateToISO(endD),
      });
    }
  };

  const displayLabel = (() => {
    if (value.comparisonType === 'custom' && value.comparisonStart && value.comparisonEnd) {
      try {
        const s = format(parse(value.comparisonStart, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
        const e = format(parse(value.comparisonEnd, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
        return value.comparisonStart === value.comparisonEnd ? s : `${s} – ${e}`;
      } catch {
        return 'Custom';
      }
    }
    return (
      comparisonOptions.find((o) => o.value === value.comparisonType)?.label ?? 'Comparison'
    );
  })();

  const calendarValue =
    (value.comparisonType === 'custom' && (value.comparisonEnd || value.comparisonStart)
      ? parse(value.comparisonEnd || value.comparisonStart!, 'yyyy-MM-dd', new Date())
      : null) ?? new Date();

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
              {comparisonOptions.map((opt) => (
                <ListItemButton
                  key={opt.value}
                  selected={value.comparisonType === opt.value}
                  onClick={() => handleSelectComparison(opt.value)}
                  sx={{
                    bgcolor: value.comparisonType === opt.value ? 'action.selected' : undefined,
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
                    value={Number.isNaN(calendarValue.getTime()) ? new Date() : calendarValue}
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
                {autoEndDate ? (
                  <TextField
                    size="small"
                    label="End date (auto)"
                    value={localEnd}
                    placeholder={DATE_DISPLAY_FORMAT}
                    InputProps={{ readOnly: true }}
                    fullWidth
                  />
                ) : (
                  <TextField
                    size="small"
                    label="End date"
                    value={localEnd}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    onBlur={handleEndBlur}
                    placeholder={DATE_DISPLAY_FORMAT}
                    fullWidth
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}

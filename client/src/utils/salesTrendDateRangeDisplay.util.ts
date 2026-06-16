import { format, parse, startOfMonth, startOfWeek, startOfYear, subMonths, subYears } from 'date-fns';
import type { ComparisonPeriodPickerValue } from '../components/SalesTrend/ComparisonPeriodPicker';
import type { PeriodPickerValue } from '../components/SalesTrend/PeriodPicker';
import type { SalesTrendComparisonType } from '../services/commandCenter.service';

type ApiTimeRange = { startAt: string; endAt: string } | null | undefined;

function normalizeApiRange(range: ApiTimeRange): { startAt: string; endAt: string } | undefined {
  return range ?? undefined;
}

const DATE_DISPLAY_FORMAT = 'MM/dd/yy';

function formatDateInTz(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).format(new Date(iso));
}

function getCalendarDateInTz(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatIsoDateRange(startAt: string, endAt: string, timezone: string): string {
  const startDate = getCalendarDateInTz(startAt, timezone);
  const endDate = getCalendarDateInTz(endAt, timezone);
  const s = formatDateInTz(startAt, timezone);
  const e = formatDateInTz(endAt, timezone);
  return startDate === endDate ? s : `${s} – ${e}`;
}

function formatCivilDateKey(dateKey: string): string | undefined {
  try {
    return format(parse(dateKey, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
  } catch {
    return undefined;
  }
}

function getTodayDateKey(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftCivilDateKey(dateKey: string, deltaDays: number): string | undefined {
  try {
    const d = parse(dateKey, 'yyyy-MM-dd', new Date());
    d.setDate(d.getDate() + deltaDays);
    return format(d, 'yyyy-MM-dd');
  } catch {
    return undefined;
  }
}

function prevMonthDateKey(dateKey: string): string | undefined {
  try {
    return format(subMonths(parse(dateKey, 'yyyy-MM-dd', new Date()), 1), 'yyyy-MM-dd');
  } catch {
    return undefined;
  }
}

function priorYearDateKey(dateKey: string): string | undefined {
  try {
    return format(subYears(parse(dateKey, 'yyyy-MM-dd', new Date()), 1), 'yyyy-MM-dd');
  } catch {
    return undefined;
  }
}

function formatCivilDateRangeFromKeys(startKey: string, endKey: string): string | undefined {
  const start = formatCivilDateKey(startKey);
  const end = formatCivilDateKey(endKey);
  if (!start || !end) return undefined;
  return startKey === endKey ? start : `${start} – ${end}`;
}

function getCivilPeriodKeys(period: PeriodPickerValue, timezone: string): { start: string; end: string } | undefined {
  if (period.periodType === 'today') {
    const today = getTodayDateKey(timezone);
    return { start: today, end: today };
  }
  if (period.periodType === 'custom' && period.periodStart && period.periodEnd) {
    return { start: period.periodStart, end: period.periodEnd };
  }

  const today = getTodayDateKey(timezone);
  const todayDate = parse(today, 'yyyy-MM-dd', new Date());

  switch (period.periodType) {
    case 'last7days': {
      const start = shiftCivilDateKey(today, -6);
      return start ? { start, end: today } : undefined;
    }
    case 'last30days': {
      const start = shiftCivilDateKey(today, -29);
      return start ? { start, end: today } : undefined;
    }
    case 'last52weeks': {
      const start = shiftCivilDateKey(today, -363);
      return start ? { start, end: today } : undefined;
    }
    case 'thisWeek': {
      const weekStart = format(startOfWeek(todayDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');
      return { start: weekStart, end: today };
    }
    case 'thisMonth': {
      const monthStart = format(startOfMonth(todayDate), 'yyyy-MM-dd');
      return { start: monthStart, end: today };
    }
    case 'thisYear': {
      const yearStart = format(startOfYear(todayDate), 'yyyy-MM-dd');
      return { start: yearStart, end: today };
    }
    default:
      return undefined;
  }
}

function shiftComparisonCivilRange(
  periodKeys: { start: string; end: string },
  comparisonType: SalesTrendComparisonType,
  periodType: PeriodPickerValue['periodType'],
): { start: string; end: string } | undefined {
  const { start, end } = periodKeys;

  switch (comparisonType) {
    case 'none':
    case 'custom':
      return undefined;
    case '1DayPrior': {
      const compStart = shiftCivilDateKey(start, -1);
      const compEnd = shiftCivilDateKey(end, -1);
      return compStart && compEnd ? { start: compStart, end: compEnd } : undefined;
    }
    case 'samePeriodPreviousWeek': {
      const compStart = shiftCivilDateKey(start, -7);
      const compEnd = shiftCivilDateKey(end, -7);
      return compStart && compEnd ? { start: compStart, end: compEnd } : undefined;
    }
    case 'samePeriodPreviousMonth': {
      const compStart = prevMonthDateKey(start);
      const compEnd = prevMonthDateKey(end);
      return compStart && compEnd ? { start: compStart, end: compEnd } : undefined;
    }
    case 'priorYear': {
      const compStart = priorYearDateKey(start);
      const compEnd = priorYearDateKey(end);
      return compStart && compEnd ? { start: compStart, end: compEnd } : undefined;
    }
    case '52WeeksPrior': {
      if (periodType === 'last52weeks') {
        const compStart = priorYearDateKey(start);
        const compEnd = priorYearDateKey(end);
        return compStart && compEnd ? { start: compStart, end: compEnd } : undefined;
      }
      const compStart = shiftCivilDateKey(start, -364);
      const compEnd = shiftCivilDateKey(end, -364);
      return compStart && compEnd ? { start: compStart, end: compEnd } : undefined;
    }
    case 'year2Before':
    case 'year3Before':
    case 'year4Before': {
      const yearsBack = comparisonType === 'year2Before' ? 2 : comparisonType === 'year3Before' ? 3 : 4;
      const targetYear = parse(end, 'yyyy-MM-dd', new Date()).getFullYear() - yearsBack;
      return { start: `${targetYear}-01-01`, end: `${targetYear}-12-31` };
    }
    default: {
      const _exhaustive: never = comparisonType;
      return _exhaustive;
    }
  }
}

function formatPeriodLabelFromPicker(period: PeriodPickerValue, timezone: string): string | undefined {
  const keys = getCivilPeriodKeys(period, timezone);
  if (!keys) return undefined;
  return formatCivilDateRangeFromKeys(keys.start, keys.end);
}

function formatComparisonLabelFromPicker(
  period: PeriodPickerValue,
  comparison: ComparisonPeriodPickerValue,
  timezone: string,
): string | undefined {
  if (
    comparison.comparisonType === 'custom' &&
    comparison.comparisonStart &&
    comparison.comparisonEnd
  ) {
    return formatCivilDateRangeFromKeys(comparison.comparisonStart, comparison.comparisonEnd);
  }

  const periodKeys = getCivilPeriodKeys(period, timezone);
  if (!periodKeys) return undefined;

  const compKeys = shiftComparisonCivilRange(periodKeys, comparison.comparisonType, period.periodType);
  if (!compKeys) return undefined;
  return formatCivilDateRangeFromKeys(compKeys.start, compKeys.end);
}

/** Legend date range for the current period (picker-aware, cache-safe). */
export function formatSalesTrendPeriodDateRangeDisplay(
  period: PeriodPickerValue,
  apiRange: ApiTimeRange,
  locationTimezone?: string | null,
): string | undefined {
  const tz = (locationTimezone ?? '').trim() || 'UTC';
  const fromPicker = formatPeriodLabelFromPicker(period, tz);
  if (fromPicker) return fromPicker;
  const range = normalizeApiRange(apiRange);
  if (!range) return undefined;
  try {
    return formatIsoDateRange(range.startAt, range.endAt, tz);
  } catch {
    return undefined;
  }
}

/** Legend date range for the comparison period (picker-aware, cache-safe). */
export function formatSalesTrendComparisonDateRangeDisplay(
  period: PeriodPickerValue,
  comparison: ComparisonPeriodPickerValue,
  apiRange: ApiTimeRange,
  locationTimezone?: string | null,
): string | undefined {
  if (comparison.comparisonType === 'none') return undefined;
  const tz = (locationTimezone ?? '').trim() || 'UTC';
  const fromPicker = formatComparisonLabelFromPicker(period, comparison, tz);
  if (fromPicker) return fromPicker;
  const range = normalizeApiRange(apiRange);
  if (!range) return undefined;
  try {
    return formatIsoDateRange(range.startAt, range.endAt, tz);
  } catch {
    return undefined;
  }
}

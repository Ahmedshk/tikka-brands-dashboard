import { getTodayRange } from './timezone.util.js';

export interface TimeRange {
  startAt: string;
  endAt: string;
}

const SQUARE_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export interface BusinessHoursPeriod {
  day_of_week: string;
  start_local_time?: string;
  end_local_time?: string;
}

export interface SquareBusinessHours {
  periods?: BusinessHoursPeriod[];
}

export interface SquareLocationForHours {
  timezone?: string;
  business_hours?: SquareBusinessHours;
}

/**
 * Parse Square local time "HH:mm:ss" to milliseconds from midnight.
 */
function localTimeToMs(localTime: string): number {
  const parts = (localTime ?? '00:00:00').split(':');
  const h = Number.parseInt(parts[0] ?? '0', 10);
  const min = Number.parseInt(parts[1] ?? '0', 10);
  const s = Number.parseInt(parts[2] ?? '0', 10);
  return (h * 3600 + min * 60 + s) * 1000;
}

/**
 * Get (year, month, day, dayOfWeek 0-6) in the given timezone for a given instant.
 */
function getDatePartsInTimezone(date: Date, timezone: string): { y: number; m: number; d: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const y = Number.parseInt(get('year'), 10);
  const m = Number.parseInt(get('month'), 10) - 1;
  const d = Number.parseInt(get('day'), 10);
  const weekday = get('weekday'); // Sun, Mon, ...
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  return { y, m, d, dayOfWeek: Math.max(0, dayOfWeek) };
}

/**
 * Get start of a calendar day in timezone as UTC Date.
 * Reuses getTodayRange logic for a specific (y, m, d) by getting "today" and then adjusting if we need another day.
 */
function getStartOfDayUtc(y: number, m: number, d: number, timezone: string): Date {
  const utcNoon = Date.UTC(y, m, d, 12, 0, 0, 0);
  const hourFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  });
  const hourStr = hourFormatter.format(utcNoon);
  const hour = Number.parseInt(hourStr.split(':')[0] ?? '0', 10);
  const offsetHours = hour - 12;
  return new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
}

/**
 * Compute the current business day range from Square location business_hours.
 * Returns { startAt, endAt } in RFC 3339 for the current (or most recent) business period.
 * If no business_hours or no periods for today/yesterday, falls back to getTodayRange(timezone).
 */
export function getBusinessDayRange(
  squareLocation: SquareLocationForHours,
  fallbackTimezone?: string
): { startAt: string; endAt: string } {
  const tz = (squareLocation.timezone ?? fallbackTimezone ?? '').trim();
  if (!tz) {
    return getTodayRange();
  }

  const periods = squareLocation.business_hours?.periods ?? [];
  if (periods.length === 0) {
    return getTodayRange(tz);
  }

  const now = new Date();
  const { y, m, d, dayOfWeek } = getDatePartsInTimezone(now, tz);
  const squareDay = SQUARE_DAYS[dayOfWeek] ?? 'SUN';

  const todayPeriods = periods.filter((p) => p.day_of_week === squareDay);

  function rangeForDate(year: number, month: number, day: number, dayName: string) {
    const dayPeriods = periods.filter((p) => p.day_of_week === dayName);
    if (dayPeriods.length === 0) return null;
    const startMs = Math.min(...dayPeriods.map((p) => localTimeToMs(p.start_local_time ?? '00:00:00')));
    const endMs = Math.max(...dayPeriods.map((p) => localTimeToMs(p.end_local_time ?? '23:59:59')));
    const startOfDay = getStartOfDayUtc(year, month, day, tz);
    return {
      startUtc: new Date(startOfDay.getTime() + startMs),
      endUtc: new Date(startOfDay.getTime() + endMs),
    };
  }

  const todayRange = rangeForDate(y, m, d, squareDay);

  function getYesterdayPartsInTz(): { y: number; m: number; d: number; squareDay: string } | null {
    const startOfToday = getStartOfDayUtc(y, m, d, tz);
    const oneMsBeforeToday = new Date(startOfToday.getTime() - 1);
    const prev = getDatePartsInTimezone(oneMsBeforeToday, tz);
    const squareDay = SQUARE_DAYS[prev.dayOfWeek] ?? 'SUN';
    return { y: prev.y, m: prev.m, d: prev.d, squareDay };
  }

  function getYesterdayRange(): { startUtc: Date; endUtc: Date } | null {
    const prevParts = getYesterdayPartsInTz();
    if (!prevParts) return null;
    return rangeForDate(prevParts.y, prevParts.m, prevParts.d, prevParts.squareDay);
  }

  let startDate: Date;
  let endDate: Date;

  const needYesterday = todayPeriods.length === 0 || (todayRange && now < todayRange.startUtc);
  if (needYesterday) {
    const yesterdayRange = getYesterdayRange();
    if (!yesterdayRange) return getTodayRange(tz);
    startDate = yesterdayRange.startUtc;
    endDate = yesterdayRange.endUtc;
  } else if (!todayRange) {
    return getTodayRange(tz);
  } else if (now > todayRange.endUtc) {
    startDate = todayRange.startUtc;
    endDate = todayRange.endUtc;
  } else {
    startDate = todayRange.startUtc;
    endDate = new Date(Math.min(now.getTime(), todayRange.endUtc.getTime()));
  }

  if (endDate > now) {
    endDate = new Date(now);
  }

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

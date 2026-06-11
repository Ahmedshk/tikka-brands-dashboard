import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { GoogleBusinessReviewPeriod } from '../services/googleBusinessReview.service';

export type RatingsReviewsPeriodType = GoogleBusinessReviewPeriod;

export interface RatingsReviewsPeriodValue {
  periodType: RatingsReviewsPeriodType;
  periodStart?: string;
  periodEnd?: string;
}

function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function parseYmd(ymd: string): { y: number; m0: number; d: number } {
  const [ys, ms, ds] = ymd.trim().split('-');
  return {
    y: Number.parseInt(ys ?? '0', 10),
    m0: Number.parseInt(ms ?? '0', 10) - 1,
    d: Number.parseInt(ds ?? '0', 10),
  };
}

function toYmd(p: { y: number; m0: number; d: number }): string {
  return `${p.y}-${String(p.m0 + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function addDaysUtc(y: number, m0: number, d: number, delta: number): { y: number; m0: number; d: number } {
  const x = new Date(Date.UTC(y, m0, d + delta));
  return { y: x.getUTCFullYear(), m0: x.getUTCMonth(), d: x.getUTCDate() };
}

function weekdaySun0FromYmd(ymd: string, timezone: string): number {
  const instant = fromZonedTime(`${ymd}T12:00:00`, timezone);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(instant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function zonedWallTodayYmd(timezone: string, now = new Date()): string {
  return formatInTimeZone(now, timezone, 'yyyy-MM-dd');
}

export function periodToDisplayDateRange(
  value: RatingsReviewsPeriodValue,
  timezone: string,
  now = new Date(),
): { startDate: string; endDate: string } | null {
  const tz = timezone.trim();
  const todayYmd = zonedWallTodayYmd(tz, now);

  switch (value.periodType) {
    case 'all':
      return null;
    case 'today':
      return { startDate: todayYmd, endDate: todayYmd };
    case 'weekToDate': {
      const { y, m0, d } = parseYmd(todayYmd);
      const dow = weekdaySun0FromYmd(todayYmd, tz);
      const sun = addDaysUtc(y, m0, d, -dow);
      return { startDate: toYmd(sun), endDate: todayYmd };
    }
    case 'month': {
      const { y, m0 } = parseYmd(todayYmd);
      return { startDate: toYmd({ y, m0, d: 1 }), endDate: todayYmd };
    }
    case 'custom': {
      const start = value.periodStart?.trim();
      const end = value.periodEnd?.trim();
      if (!start || !end || !isValidYmd(start) || !isValidYmd(end)) {
        throw new Error('Custom period requires valid start and end dates.');
      }
      if (start > end) return { startDate: end, endDate: start };
      return { startDate: start, endDate: end };
    }
    default: {
      const _exhaustive: never = value.periodType;
      return _exhaustive;
    }
  }
}

export function customPeriodToIsoRange(
  startYmd: string,
  endYmd: string,
  timezone: string,
): { startDate: string; endDate: string } {
  const tz = timezone.trim();
  return {
    startDate: fromZonedTime(`${startYmd}T00:00:00`, tz).toISOString(),
    endDate: fromZonedTime(`${endYmd}T23:59:59.999`, tz).toISOString(),
  };
}

export function getMaxSelectableDateInTimezone(timezone: string, now = new Date()): Date {
  const ymd = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  return fromZonedTime(`${ymd}T23:59:59.999`, timezone);
}

export const DEFAULT_RATINGS_PERIOD: RatingsReviewsPeriodValue = { periodType: 'all' };

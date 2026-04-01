import { addDays, addHours, format, isValid, parse } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { QUARTER_HOUR_HH_MM, snapHmToQuarterHour } from './quarterHourTimeOptions';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Split browser-local `Date` into YYYY-MM-DD and HH:mm. */
export function splitBrowserLocalDateTime(d: Date): { date: string; time: string } {
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function combineBrowserLocalDateTime(dateStr: string, timeStr: string): Date | null {
  const dPart = dateStr.trim();
  const tPart = timeStr.trim();
  if (!dPart || !tPart) return null;
  const dp = dPart.split('-');
  if (dp.length !== 3) return null;
  const y = Number.parseInt(dp[0] ?? '', 10);
  const mo = Number.parseInt(dp[1] ?? '', 10);
  const d = Number.parseInt(dp[2] ?? '', 10);
  const tp = tPart.split(':');
  const h = Number.parseInt(tp[0] ?? '', 10);
  const mi = Number.parseInt(tp[1] ?? '0', 10);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

function defaultRangeBrowserLocal(): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = addHours(start, 1);
  const s = splitBrowserLocalDateTime(start);
  const e = splitBrowserLocalDateTime(end);
  return { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time };
}

/** Today's calendar date (yyyy-MM-dd) in the IANA zone, or browser-local when `timeZone` is missing. */
export function zonedWallTodayYmd(timeZone: string | undefined): string {
  const tz = timeZone?.trim();
  const now = new Date();
  if (!tz) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  return formatInTimeZone(now, tz, 'yyyy-MM-dd');
}

/** Lexicographic max for yyyy-MM-dd strings. */
export function wallYmdMax(a: string, b: string): string {
  const at = a.trim();
  const bt = b.trim();
  if (!at) return bt;
  if (!bt) return at;
  return at >= bt ? at : bt;
}

/** Next calendar day after `ymd` (yyyy-MM-dd). */
export function nextWallYmd(ymd: string): string {
  const p = parse(ymd.trim(), 'yyyy-MM-dd', new Date());
  if (!isValid(p)) return ymd.trim();
  return format(addDays(p, 1), 'yyyy-MM-dd');
}

/**
 * Default start/end: next full hour (location-local) and +1h end, when `timeZone` is set;
 * otherwise same logic in the browser's local timezone.
 */
export function defaultEventRange(timeZone: string | undefined): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} {
  const tz = timeZone?.trim();
  if (!tz) return defaultRangeBrowserLocal();

  try {
    const now = new Date();
    const ymd = formatInTimeZone(now, tz, 'yyyy-MM-dd');
    const HH = formatInTimeZone(now, tz, 'HH');
    const startOfHourInTz = fromZonedTime(`${ymd}T${HH}:00:00`, tz);
    const start = addHours(startOfHourInTz, 1);
    const end = addHours(start, 1);
    return {
      startDate: formatInTimeZone(start, tz, 'yyyy-MM-dd'),
      startTime: formatInTimeZone(start, tz, 'HH:mm'),
      endDate: formatInTimeZone(end, tz, 'yyyy-MM-dd'),
      endTime: formatInTimeZone(end, tz, 'HH:mm'),
    };
  } catch {
    return defaultRangeBrowserLocal();
  }
}

/**
 * Interprets calendar date + wall time in `timeZone` (IANA) and returns the UTC instant.
 * Falls back to browser-local interpretation when `timeZone` is missing.
 */
export function combineDateTimeInTimezone(
  dateStr: string,
  timeStr: string,
  timeZone: string | undefined,
): Date | null {
  const tz = timeZone?.trim();
  if (!tz) return combineBrowserLocalDateTime(dateStr, timeStr);

  const dPart = dateStr.trim();
  const tPart = timeStr.trim();
  if (!dPart || !tPart) return null;
  const dp = dPart.split('-');
  if (dp.length !== 3) return null;
  const y = Number.parseInt(dp[0] ?? '', 10);
  const mo = Number.parseInt(dp[1] ?? '', 10);
  const d = Number.parseInt(dp[2] ?? '', 10);
  const tp = tPart.split(':');
  const h = Number.parseInt(tp[0] ?? '', 10);
  const mi = Number.parseInt(tp[1] ?? '0', 10);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;

  const timeNorm = `${pad2(h)}:${pad2(mi)}:00`;
  try {
    const instant = fromZonedTime(`${dPart}T${timeNorm}`, tz);
    if (Number.isNaN(instant.getTime())) return null;
    return instant;
  } catch {
    return null;
  }
}

/**
 * Quarter-hour HH:mm values on this wall date in `timeZone` whose zoned instant is >= `now`
 * (defaults to current time).
 */
export function quarterHoursOnOrAfterNowOnWallDate(
  ymd: string,
  timeZone: string | undefined,
  now: Date = new Date(),
): readonly string[] {
  return QUARTER_HOUR_HH_MM.filter((hm) => {
    const inst = combineDateTimeInTimezone(ymd, hm, timeZone);
    return inst != null && inst.getTime() >= now.getTime();
  });
}

/**
 * Split an ISO instant into date (yyyy-MM-dd) and quarter-hour HH:mm in the given IANA zone,
 * or browser-local with snapped time when `timeZone` is missing.
 */
export function splitInstantToLocationWallForForm(
  iso: string,
  timeZone: string | undefined,
): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: '', time: '09:00' };
  }
  const tz = timeZone?.trim();
  if (!tz) {
    const s = splitBrowserLocalDateTime(d);
    return { date: s.date, time: snapHmToQuarterHour(s.time, '09:00') };
  }
  try {
    const date = formatInTimeZone(d, tz, 'yyyy-MM-dd');
    const rawHm = formatInTimeZone(d, tz, 'HH:mm');
    return { date, time: snapHmToQuarterHour(rawHm, '09:00') };
  } catch {
    const s = splitBrowserLocalDateTime(d);
    return { date: s.date, time: snapHmToQuarterHour(s.time, '09:00') };
  }
}

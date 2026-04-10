/**
 * True wall-clock hour starts in an IANA timezone (DST-safe).
 * Do not use getStartOfDayUtc + hour * 3_600_000 — that drifts from civil hours when offsets change within the day.
 */
import { fromZonedTime } from "date-fns-tz";

const HOURLY_CHART_KEY = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/;

export function parseYmdHourFromChartKey(key: string): {
  y: number;
  m0: number;
  d: number;
  hour: number;
} | null {
  const m = HOURLY_CHART_KEY.exec(key.trim());
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10) - 1;
  const d = Number.parseInt(m[3]!, 10);
  const hour = Number.parseInt(m[4]!, 10);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return null;
  }
  return { y, m0: mo, d, hour };
}

/** Start of civil hour `hour` (0–23) on local date (y, m0, d) in `timezone`. */
export function wallClockZonedInstantFromYmdHm(
  y: number,
  m0: number,
  d: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const tz = timezone.trim() || "UTC";
  const MM = String(m0 + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const HH = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return fromZonedTime(`${y}-${MM}-${dd}T${HH}:${mm}:00.000`, tz);
}

export function wallClockZonedHourStartFromYmdHour(
  y: number,
  m0: number,
  d: number,
  hour: number,
  timezone: string,
): Date {
  return wallClockZonedInstantFromYmdHm(y, m0, d, hour, 0, timezone);
}

/** Parse `yyyy-MM-ddTHH` and return the UTC instant for that wall hour's start. */
export function wallClockHourStartUtcFromChartKey(
  chartKey: string,
  timezone: string,
): Date | null {
  const parsed = parseYmdHourFromChartKey(chartKey);
  if (!parsed) return null;
  const d = wallClockZonedHourStartFromYmdHour(
    parsed.y,
    parsed.m0,
    parsed.d,
    parsed.hour,
    timezone,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Next civil hour after `(y,m0,d,h)` (Gregorian date arithmetic; labels are local civil). */
export function incrementLocalWallHour(y: number, m0: number, d: number, h: number): {
  y: number;
  m0: number;
  d: number;
  h: number;
} {
  let nh = h + 1;
  let ny = y;
  let nm = m0;
  let nd = d;
  if (nh > 23) {
    nh = 0;
    const t = new Date(Date.UTC(ny, nm, nd + 1));
    ny = t.getUTCFullYear();
    nm = t.getUTCMonth();
    nd = t.getUTCDate();
  }
  return { y: ny, m0: nm, d: nd, h: nh };
}

/** Add civil minutes to a local (Gregorian) y/m/d clock time; rolls day/month via UTC date math. */
export function addCivilMinutesToLocalYmdHm(
  y: number,
  m0: number,
  d: number,
  h: number,
  mi: number,
  deltaMinutes: number,
): { y: number; m0: number; d: number; h: number; mi: number } {
  let total = h * 60 + mi + deltaMinutes;
  const extraDays = Math.floor(total / (24 * 60));
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nmi = total % 60;
  const t = new Date(Date.UTC(y, m0, d + extraDays));
  return {
    y: t.getUTCFullYear(),
    m0: t.getUTCMonth(),
    d: t.getUTCDate(),
    h: nh,
    mi: nmi,
  };
}

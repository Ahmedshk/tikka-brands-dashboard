import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type KitchenPerformancePeriodType =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "custom";

export interface KitchenPerformancePeriodValue {
  periodType: KitchenPerformancePeriodType;
  periodStart?: string;
  periodEnd?: string;
}

function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

/** Civil calendar add; month is 0-based (Date.UTC convention). */
function addDaysUtc(y: number, m0: number, d: number, delta: number): { y: number; m0: number; d: number } {
  const x = new Date(Date.UTC(y, m0, d + delta));
  return { y: x.getUTCFullYear(), m0: x.getUTCMonth(), d: x.getUTCDate() };
}

function toYmd(p: { y: number; m0: number; d: number }): string {
  return `${p.y}-${String(p.m0 + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function parseYmd(ymd: string): { y: number; m0: number; d: number } {
  const [ys, ms, ds] = ymd.trim().split("-");
  const y = Number.parseInt(ys ?? "0", 10);
  const mo = Number.parseInt(ms ?? "0", 10);
  const d = Number.parseInt(ds ?? "0", 10);
  return { y, m0: mo - 1, d };
}

/** Sunday = 0 … Saturday = 6 for civil `ymd` at noon in `timezone`. */
function weekdaySun0FromYmd(ymd: string, timezone: string): number {
  const instant = fromZonedTime(`${ymd}T12:00:00`, timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekday = formatter.format(instant);
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
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

export function periodToDateRange(
  value: KitchenPerformancePeriodValue,
  timezone: string,
  now = new Date(),
): { startDate: string; endDate: string } {
  const tz = timezone.trim();
  const todayYmd = zonedWallTodayYmd(tz, now);

  switch (value.periodType) {
    case "today":
      return { startDate: todayYmd, endDate: todayYmd };
    case "yesterday": {
      const { y, m0, d } = parseYmd(todayYmd);
      const prev = addDaysUtc(y, m0, d, -1);
      const ymd = toYmd(prev);
      return { startDate: ymd, endDate: ymd };
    }
    case "thisWeek": {
      const { y, m0, d } = parseYmd(todayYmd);
      const dow = weekdaySun0FromYmd(todayYmd, tz);
      const sun = addDaysUtc(y, m0, d, -dow);
      return { startDate: toYmd(sun), endDate: todayYmd };
    }
    case "lastWeek": {
      const { y, m0, d } = parseYmd(todayYmd);
      const dow = weekdaySun0FromYmd(todayYmd, tz);
      const thisSunday = addDaysUtc(y, m0, d, -dow);
      const lastSunday = addDaysUtc(thisSunday.y, thisSunday.m0, thisSunday.d, -7);
      const lastSaturday = addDaysUtc(lastSunday.y, lastSunday.m0, lastSunday.d, 6);
      return { startDate: toYmd(lastSunday), endDate: toYmd(lastSaturday) };
    }
    case "custom": {
      const start = value.periodStart?.trim();
      const end = value.periodEnd?.trim();
      if (!start || !end || !isValidYmd(start) || !isValidYmd(end)) {
        throw new Error(
          "periodToDateRange: custom period requires valid periodStart and periodEnd (yyyy-MM-dd).",
        );
      }
      if (start > end) return { startDate: end, endDate: start };
      return { startDate: start, endDate: end };
    }
    default:
      return { startDate: todayYmd, endDate: todayYmd };
  }
}

function rangesEqual(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate === b.startDate && a.endDate === b.endDate;
}

/** Best-effort label: map URL range back to a preset when it matches computed bounds. */
export function inferPeriodFromDateRange(
  startDate: string,
  endDate: string,
  timezone: string,
  now = new Date(),
): KitchenPerformancePeriodValue {
  const s = startDate.trim();
  const e = endDate.trim();
  if (!isValidYmd(s) || !isValidYmd(e)) {
    return { periodType: "custom", periodStart: s, periodEnd: e };
  }
  const range = { startDate: s, endDate: e };

  const presets: KitchenPerformancePeriodType[] = [
    "today",
    "yesterday",
    "thisWeek",
    "lastWeek",
  ];
  for (const periodType of presets) {
    const computed = periodToDateRange({ periodType }, timezone, now);
    if (rangesEqual(range, computed)) {
      return { periodType };
    }
  }
  return { periodType: "custom", periodStart: s, periodEnd: e };
}

export function getMaxSelectableDateInTimezone(timezone: string, now = new Date()): Date {
  const ymd = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  return fromZonedTime(`${ymd}T23:59:59.999`, timezone);
}

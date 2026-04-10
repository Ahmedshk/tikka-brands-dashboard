/** Calendar (y, month 0-based, d) for an instant in `timezone` (DST-safe). */
export function getCalendarYmdInTz(
  utcMs: number,
  timezone: string,
): { y: number; m: number; d: number } {
  const tz = timezone.trim();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    y: Number.parseInt(get("year"), 10),
    m: Number.parseInt(get("month"), 10) - 1,
    d: Number.parseInt(get("day"), 10),
  };
}

function compareCalendarYmd(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number },
): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

/**
 * Start of a calendar day in timezone as UTC Date (first instant of that local date).
 * Binary search so DST transitions (e.g. US spring forward) are correct; the old
 * noon-offset formula could map “Mar 8” to the wrong UTC instant.
 */
export function getStartOfDayUtc(
  y: number,
  m: number,
  d: number,
  timezone: string,
): Date {
  const tz = timezone.trim();
  const target = { y, m, d };
  const dayMs = 24 * 60 * 60 * 1000;
  let lo = Date.UTC(y, m, d, 12, 0, 0, 0) - 72 * 60 * 60 * 1000;
  let hi = Date.UTC(y, m, d, 12, 0, 0, 0) + 72 * 60 * 60 * 1000;
  while (compareCalendarYmd(getCalendarYmdInTz(lo, tz), target) >= 0) {
    lo -= dayMs;
  }
  while (compareCalendarYmd(getCalendarYmdInTz(hi, tz), target) < 0) {
    hi += dayMs;
  }
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (compareCalendarYmd(getCalendarYmdInTz(mid, tz), target) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return new Date(lo);
}

/** Add days to civil (y, month 0-based, d); uses UTC calendar math (host-TZ agnostic). */
function addDaysUtc(y: number, m: number, d: number, delta: number): {
  y: number;
  m: number;
  d: number;
} {
  const x = new Date(Date.UTC(y, m, d + delta));
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth(),
    d: x.getUTCDate(),
  };
}

/** End of local calendar day (last ms before next local day) in `timezone`. */
export function getEndOfDayUtc(
  y: number,
  m: number,
  d: number,
  timezone: string,
): Date {
  const next = addDaysUtc(y, m, d, 1);
  const startNext = getStartOfDayUtc(next.y, next.m, next.d, timezone);
  return new Date(startNext.getTime() - 1);
}

/**
 * Parse "HH:mm" to hours and minutes (ms from midnight).
 */
function parseBusinessStartTime(hhmm: string): number {
  const parts = (hhmm ?? "00:00").trim().split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const min = Number.parseInt(parts[1] ?? "0", 10);
  return (h * 3600 + min * 60) * 1000;
}

/**
 * Get the current business-day range from a fixed "business start time" (e.g. 4:00 AM).
 * Window is [businessStartTime today, 3:59:59 AM next day] in location TZ,
 * or yesterday's window if current time is before business start time today.
 * endAt is always the last millisecond before the next day's business start. Returns RFC 3339 strings.
 */
export function getBusinessStartTimeRange(
  timezone: string,
  businessStartTime: string,
): { startAt: string; endAt: string } {
  const tz = timezone.trim();
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number.parseInt(get("year"), 10);
  const m = Number.parseInt(get("month"), 10) - 1;
  const d = Number.parseInt(get("day"), 10);
  const currentHour = Number.parseInt(get("hour"), 10);
  const currentMin = Number.parseInt(get("minute"), 10);
  const currentSec = Number.parseInt(get("second"), 10);
  const currentMsFromMidnight =
    (currentHour * 3600 + currentMin * 60 + currentSec) * 1000;
  const startMsFromMidnight = parseBusinessStartTime(businessStartTime);

  const startOfToday = getStartOfDayUtc(y, m, d, tz);
  let startDate: Date;
  let endDate: Date;

  if (currentMsFromMidnight >= startMsFromMidnight) {
    // Current business day: starts at business start time today, ends at 3:59:59 AM next day
    startDate = new Date(startOfToday.getTime() + startMsFromMidnight);
    const startOfTomorrow = getStartOfDayUtc(y, m, d + 1, tz);
    endDate = new Date(startOfTomorrow.getTime() + startMsFromMidnight - 1);
  } else {
    // Before business start today: use yesterday's business day (ends at 3:59:59 AM today)
    const startOfYesterday = getStartOfDayUtc(y, m, d - 1, tz);
    startDate = new Date(startOfYesterday.getTime() + startMsFromMidnight);
    endDate = new Date(startOfToday.getTime() + startMsFromMidnight - 1);
  }

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Week-to-date range: Sunday 00:00:00 of the current week in location TZ through end of current business day.
 * End reuses getBusinessStartTimeRange(...).endAt so WTD is Sunday through end of today's business day.
 */
export function getWeekToDateRange(
  timezone: string,
  businessStartTime: string,
): { startAt: string; endAt: string } {
  const tz = timezone.trim();
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number.parseInt(get("year"), 10);
  const m = Number.parseInt(get("month"), 10) - 1;
  const d = Number.parseInt(get("day"), 10);
  const weekday = get("weekday");
  const dayOfWeek = WEEKDAY_ORDER.indexOf(
    weekday as (typeof WEEKDAY_ORDER)[number],
  );
  const dayOfWeekSafe = Math.max(0, Math.min(6, dayOfWeek));

  let startOfSunday = getStartOfDayUtc(y, m, d, tz);
  for (let i = 0; i < dayOfWeekSafe; i++) {
    const prevDay = new Date(
      startOfSunday.getTime() - 24 * 60 * 60 * 1000,
    );
    const prevParts = formatter.formatToParts(prevDay);
    const py = Number.parseInt(
      prevParts.find((p) => p.type === "year")?.value ?? "0",
      10,
    );
    const pm =
      Number.parseInt(
        prevParts.find((p) => p.type === "month")?.value ?? "0",
        10,
      ) - 1;
    const pd = Number.parseInt(
      prevParts.find((p) => p.type === "day")?.value ?? "0",
      10,
    );
    startOfSunday = getStartOfDayUtc(py, pm, pd, tz);
  }

  const { endAt } = getBusinessStartTimeRange(tz, businessStartTime);
  return {
    startAt: startOfSunday.toISOString(),
    endAt,
  };
}

/**
 * Get business-day window for a specific calendar date (y, m, d) in timezone.
 * startAt = business start time on that day; endAt = last millisecond before next day's business start.
 * Use for custom date ranges so each day is from business start to end of business day.
 */
export function getBusinessDayRangeForDate(
  timezone: string,
  businessStartTime: string,
  y: number,
  m: number,
  d: number,
): { startAt: string; endAt: string } {
  const tz = timezone.trim();
  const startMs = parseBusinessStartTime(businessStartTime);
  const startOfDay = getStartOfDayUtc(y, m, d, tz);
  const startAt = new Date(startOfDay.getTime() + startMs);
  // Next calendar day in the same (y,m,d) space as getStartOfDayUtc — do not use
  // `new Date(y, m, d + 1)` (that is interpreted in the *server* local timezone).
  const startOfNextDay = getStartOfDayUtc(y, m, d + 1, tz);
  const endAt = new Date(startOfNextDay.getTime() + startMs - 1);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

/**
 * Get start and end of "today" in RFC 3339 format.
 * If timezone is provided, "today" is the local calendar day in that IANA timezone.
 * Otherwise uses UTC.
 */
export function getTodayRange(timezone?: string): {
  startAt: string;
  endAt: string;
} {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  const tz = timezone?.trim();
  if (tz) {
    // Get (year, month, day) in the given timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "0";
    const y = Number.parseInt(get("year"), 10);
    const m = Number.parseInt(get("month"), 10) - 1;
    const d = Number.parseInt(get("day"), 10);

    // Offset at noon UTC on this date in the timezone (for DST)
    const utcNoon = Date.UTC(y, m, d, 12, 0, 0, 0);
    const hourFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
    });
    const hourStr = hourFormatter.format(utcNoon);
    const hour = Number.parseInt(hourStr.split(":")[0] ?? "0", 10);
    const offsetHours = hour - 12;

    startDate = new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
    endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
  } else {
    startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    endDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  // Never request a range that ends in the future (Square has no future orders)
  if (endDate > now) {
    endDate = new Date(now);
  }
  // If "today" in the timezone is still in the future (wrong server clock or timezone), use UTC today up to now
  if (startDate > now) {
    startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    endDate = new Date(now);
  }

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

/**
 * Get start and end of "today" as full calendar day (00:00:00 to 23:59:59) in RFC 3339 format.
 * Does not clamp to current time; use for hourly bucketing where future hours will be null.
 */
export function getTodayRangeFullDay(timezone: string): {
  startAt: string;
  endAt: string;
} {
  const now = new Date();
  const tz = timezone.trim();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number.parseInt(get("year"), 10);
  const m = Number.parseInt(get("month"), 10) - 1;
  const d = Number.parseInt(get("day"), 10);

  const utcNoon = Date.UTC(y, m, d, 12, 0, 0, 0);
  const hourFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const hourStr = hourFormatter.format(utcNoon);
  const hour = Number.parseInt(hourStr.split(":")[0] ?? "0", 10);
  const offsetHours = hour - 12;

  const startDate = new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

/**
 * Get start and end of "same day last week" (today minus 7 days) in RFC 3339 format.
 * "Today" is the local calendar day in the given IANA timezone; same day last week is that day minus 7.
 */
export function getSameDayLastWeekRange(timezone: string): {
  startAt: string;
  endAt: string;
} {
  const tz = timezone.trim();
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number.parseInt(get("year"), 10);
  const m = Number.parseInt(get("month"), 10) - 1;
  const d = Number.parseInt(get("day"), 10);

  const lastWeekDate = new Date(y, m, d - 7);
  const y2 = lastWeekDate.getFullYear();
  const m2 = lastWeekDate.getMonth();
  const d2 = lastWeekDate.getDate();

  const startDate = getStartOfDayUtc(y2, m2, d2, tz);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

/**
 * Get the current hour (0-23) in the given IANA timezone.
 */
export function getCurrentHourInTimezone(timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    hour: "2-digit",
    hour12: false,
  });
  const hourStr = formatter.format(new Date());
  return Number.parseInt(hourStr, 10) || 0;
}

/**
 * Get the hour (0-23) of an ISO 8601 timestamp when interpreted in the given IANA timezone.
 */
export function getHourInTimezone(isoDateString: string, timezone: string): number {
  const date = new Date(isoDateString);
  if (Number.isNaN(date.getTime())) return 0;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    hour: "2-digit",
    hour12: false,
  });
  const hourStr = formatter.format(date);
  return Number.parseInt(hourStr, 10) || 0;
}

/**
 * Get the current calendar date in the given IANA timezone as YYYY-MM-DD.
 */
export function getTodayInTimezoneAt(timezone: string, atMs: number): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(atMs));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = get("year");
  const m = get("month").padStart(2, "0");
  const d = get("day").padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getTodayInTimezone(timezone: string): string {
  return getTodayInTimezoneAt(timezone, Date.now());
}

/**
 * For a date string YYYY-MM-DD, return the Sunday of that week and the day-of-week (0=Sun .. 6=Sat).
 * Used for goal resolution (future week + day override).
 */
export function getWeekStartAndDayOfWeek(dateStr: string): {
  weekStartDate: string;
  dayOfWeek: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const yStr = match?.[1];
  const mStr = match?.[2];
  const dStr = match?.[3];
  if (!yStr || !mStr || !dStr) {
    return { weekStartDate: dateStr, dayOfWeek: 0 };
  }
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10) - 1;
  const d = Number.parseInt(dStr, 10);
  const date = new Date(Date.UTC(y, m, d));
  if (Number.isNaN(date.getTime())) {
    return { weekStartDate: dateStr, dayOfWeek: 0 };
  }
  const dayOfWeek = date.getUTCDay();
  const sunday = new Date(date);
  sunday.setUTCDate(date.getUTCDate() - dayOfWeek);
  const sy = sunday.getUTCFullYear();
  const sm = String(sunday.getUTCMonth() + 1).padStart(2, "0");
  const sd = String(sunday.getUTCDate()).padStart(2, "0");
  return {
    weekStartDate: `${sy}-${sm}-${sd}`,
    dayOfWeek: dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  };
}

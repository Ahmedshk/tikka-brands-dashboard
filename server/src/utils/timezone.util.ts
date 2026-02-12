/**
 * Get start of a calendar day in timezone as UTC Date (midnight in that TZ).
 */
function getStartOfDayUtc(
  y: number,
  m: number,
  d: number,
  timezone: string,
): Date {
  const utcNoon = Date.UTC(y, m, d, 12, 0, 0, 0);
  const hourFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const hourStr = hourFormatter.format(utcNoon);
  const hour = Number.parseInt(hourStr.split(":")[0] ?? "0", 10);
  const offsetHours = hour - 12;
  return new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
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
 * endAt is always 1 second before the next day's business start (e.g. 3:59:59 AM next day). Returns RFC 3339 strings.
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
    endDate = new Date(startOfTomorrow.getTime() + startMsFromMidnight - 1000);
  } else {
    // Before business start today: use yesterday's business day (ends at 3:59:59 AM today)
    const startOfYesterday = getStartOfDayUtc(y, m, d - 1, tz);
    startDate = new Date(startOfYesterday.getTime() + startMsFromMidnight);
    endDate = new Date(startOfToday.getTime() + startMsFromMidnight - 1000);
  }

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
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
    const y = parseInt(get("year"), 10);
    const m = parseInt(get("month"), 10) - 1;
    const d = parseInt(get("day"), 10);

    // Offset at noon UTC on this date in the timezone (for DST)
    const utcNoon = Date.UTC(y, m, d, 12, 0, 0, 0);
    const hourFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
    });
    const hourStr = hourFormatter.format(utcNoon);
    const hour = parseInt(hourStr.split(":")[0] ?? "0", 10);
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

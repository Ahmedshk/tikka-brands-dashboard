// Client-side mirror of server time-due normalization (ISO + raw string comparison).
function parseInstant(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim().replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeRawTimestamp(value: string): string {
  return value
    .trim()
    .replace(" ", "T")
    .replace(/\.\d+(Z)?$/i, "")
    .replace(/Z$/i, "");
}

function sameUtcMinute(a: Date, b: Date): boolean {
  const minuteMs = 60_000;
  return Math.floor(a.getTime() / minuteMs) === Math.floor(b.getTime() / minuteMs);
}

export function normalizeKitchenPerformanceTimeDue(
  timeDue: string | null,
  timeCreated: string | null,
  rawTimeDue?: string | null,
  rawTimeCreated?: string | null,
): string | null {
  if (!timeDue?.trim()) return null;
  if (!timeCreated?.trim()) return timeDue;

  if (
    rawTimeDue?.trim() &&
    rawTimeCreated?.trim() &&
    normalizeRawTimestamp(rawTimeDue) === normalizeRawTimestamp(rawTimeCreated)
  ) {
    return null;
  }

  const due = parseInstant(timeDue);
  const created = parseInstant(timeCreated);
  if (!due || !created) return timeDue;

  if (sameUtcMinute(due, created) || due.getTime() <= created.getTime()) {
    return null;
  }

  return timeDue;
}

export function normalizeKitchenPerformanceTicketLateFlag(
  isLate: boolean | null,
  timeDue: string | null,
): boolean | null {
  if (timeDue == null) return false;
  return isLate;
}

export function getEffectiveKitchenPerformanceTimeDue(
  timeDue: string | null,
  timeCreated: string | null,
): string | null {
  return normalizeKitchenPerformanceTimeDue(timeDue, timeCreated);
}

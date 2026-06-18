import { fromZonedTime } from "date-fns-tz";

function parseAbsoluteTimestamp(value: string): Date | null {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasExplicitOffset(value: string): boolean {
  return value.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(value);
}

/**
 * Parse kitchen performance timestamps from CSV import.
 * Naive values (no `Z` / offset) are wall time in the store timezone.
 * Values with `Z` or a numeric offset are parsed as absolute instants.
 */
export function parseKitchenPerformanceTimestamp(
  value: string | null,
  timezone: string,
): Date | null {
  if (!value?.trim()) return null;
  const s = value.trim();
  if (hasExplicitOffset(s)) {
    return parseAbsoluteTimestamp(s);
  }
  const normalized = s.replace(" ", "T");
  try {
    const parsed = fromZonedTime(normalized, timezone.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Parse Square KDS reporting timestamps (`display_on_kds_at`, etc.).
 * Naive values without an offset are UTC wall time (same convention as Square CSV exports with `Z`).
 */
export function parseKdsReportingTimestamp(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const s = value.trim();
  if (hasExplicitOffset(s)) {
    return parseAbsoluteTimestamp(s);
  }
  const normalized = s.replace(" ", "T");
  return parseAbsoluteTimestamp(`${normalized}Z`);
}

/** Normalize CSV / legacy timestamps to UTC ISO. */
export function normalizeKitchenPerformanceTimestampToUtcIso(
  value: string | null,
  timezone: string,
): string | null {
  const parsed = parseKitchenPerformanceTimestamp(value, timezone);
  return parsed ? parsed.toISOString() : null;
}

/** Normalize Square KDS reporting timestamps to UTC ISO. */
export function normalizeKdsReportingTimestampToUtcIso(
  value: string | null,
): string | null {
  const parsed = parseKdsReportingTimestamp(value);
  return parsed ? parsed.toISOString() : null;
}

export function sortKitchenPerformanceTicketsByTimeCreatedAsc<
  T extends { timeCreated: string | null },
>(rows: T[], timezone: string): T[] {
  return [...rows].sort((a, b) => {
    const aMs = timestampSortKey(a.timeCreated, timezone);
    const bMs = timestampSortKey(b.timeCreated, timezone);
    return aMs - bMs;
  });
}

function timestampSortKey(value: string | null, timezone: string): number {
  if (!value?.trim()) return Number.POSITIVE_INFINITY;
  const parsed = value.endsWith("Z")
    ? new Date(value)
    : parseKitchenPerformanceTimestamp(value, timezone);
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.getTime()
    : Number.POSITIVE_INFINITY;
}

export function parseUtcIsoTimestamp(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export function isValidYmd(s: string | null): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

export function formatYmdShort(ymd: string, timezone: string): string {
  const trimmed = ymd.trim();
  if (!isValidYmd(trimmed)) return ymd;
  try {
    const tz = timezone.trim();
    const instant = fromZonedTime(`${trimmed}T12:00:00`, tz);
    return formatInTimeZone(instant, tz, 'MMM d, yyyy');
  } catch {
    return ymd;
  }
}


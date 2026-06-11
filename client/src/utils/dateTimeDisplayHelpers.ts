import { formatInTimeZone } from 'date-fns-tz';

function parseDisplayInstant(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim().replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatDateTimeParts(
  value: string | null,
  timezone: string,
): { time: string; date: string } {
  const parsed = parseDisplayInstant(value);
  if (!parsed) return { time: '—', date: '—' };
  const tz = timezone.trim();
  return {
    time: formatInTimeZone(parsed, tz, 'h:mm a'),
    date: formatInTimeZone(parsed, tz, 'M/d/yyyy'),
  };
}

export function formatReadableDateTime(value: string | null, timezone: string): string {
  const parsed = parseDisplayInstant(value);
  if (!parsed) return '—';
  const tz = timezone.trim();
  return formatInTimeZone(parsed, tz, 'EEEE, MMMM d, yyyy h:mm a');
}

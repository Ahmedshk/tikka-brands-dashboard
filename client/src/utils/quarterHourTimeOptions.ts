function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Every wall time from 12:00 AM through 11:45 PM in 15-minute steps, as HH:mm (24h). */
export const QUARTER_HOUR_HH_MM: readonly string[] = Array.from({ length: 96 }, (_, i) => {
  const totalMinutes = i * 15;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
});

export const QUARTER_HOUR_SET: ReadonlySet<string> = new Set(QUARTER_HOUR_HH_MM);

/** e.g. 00:00 → "12:00 AM", 23:45 → "11:45 PM" */
export function formatHmAs12h(hm: string): string {
  const parts = hm.split(':');
  const h = Number.parseInt(parts[0] ?? '', 10);
  const m = Number.parseInt(parts[1] ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

const MAX_MINUTES = 23 * 60 + 45;

/** Map any HH:mm to the nearest valid quarter-hour slot (clamped to 00:00–23:45). */
export function snapHmToQuarterHour(hm: string, fallback: string): string {
  const t = hm.trim();
  const dp = t.split(':');
  if (dp.length < 2) return QUARTER_HOUR_SET.has(fallback) ? fallback : '09:00';
  const h = Number.parseInt(dp[0] ?? '', 10);
  const m = Number.parseInt(dp[1] ?? '', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return QUARTER_HOUR_SET.has(fallback) ? fallback : '09:00';
  const total = h * 60 + m;
  const rounded = Math.round(total / 15) * 15;
  const capped = Math.min(MAX_MINUTES, Math.max(0, rounded));
  const hh = Math.floor(capped / 60);
  const mm = capped % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

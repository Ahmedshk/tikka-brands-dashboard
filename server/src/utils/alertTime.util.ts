/**
 * Local clock HH:mm (24h) in an IANA timezone at a specific instant, zero-padded.
 */
export function getLocalTimeHmInTimezoneAt(timezone: string, timeMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timeMs));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/**
 * Current local clock HH:mm (24h) in an IANA timezone, zero-padded.
 */
export function getLocalTimeHmInTimezone(timezone: string): string {
  return getLocalTimeHmInTimezoneAt(timezone, Date.now());
}

/** Normalize "9:5" / "09:05" to HH:mm for comparison. */
export function normalizeHm(hm: string): string {
  const [a, b] = hm.trim().split(":");
  const h = Number.parseInt(a ?? "0", 10);
  const min = Number.parseInt(b ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return hm.trim();
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

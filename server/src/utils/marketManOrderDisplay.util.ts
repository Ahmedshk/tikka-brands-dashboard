/** Parse MarketMan UTC date string (yyyy/MM/dd HH:mm:ss) to Date for sorting. */
export function parseMarketManUtc(s: string | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!match) return null;
  const [, y, m, d, h, min, sec] = match;
  const t = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(min),
    Number(sec),
  );
  return Number.isNaN(t) ? null : new Date(t);
}

/** Format a MarketMan UTC date for display in a timezone (e.g. "Mar 25, 2025") — matches Order Tracker card. */
export function formatOrderDateInTz(utcDateString: string | undefined, timezone: string): string {
  const d = parseMarketManUtc(utcDateString);
  if (!d) return "";
  try {
    return d.toLocaleDateString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

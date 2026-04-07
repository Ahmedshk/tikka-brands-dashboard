/**
 * Parse MarketMan UTC date strings (yyyy/MM/dd HH:mm:ss) for comparisons and filtering.
 */

/** Date-only prefix yyyy/MM/dd from a MarketMan UTC string. */
export function marketManUtcDatePrefix(utcString: string): string {
  const t = utcString.trim().replaceAll("-", "/");
  const space = t.indexOf(" ");
  return space === -1 ? t : t.slice(0, space);
}

/**
 * Stable `syncDateKey` for on-demand actual/theo snapshots (one row per count period).
 * No TTL is applied to these documents yet; revisit if stale data becomes an issue.
 */
export function marketManLazyActualTheoSyncDateKey(
  countStartUtc: string,
  countEndUtc: string,
): string {
  const a = marketManUtcDatePrefix(countStartUtc).replaceAll("/", "-");
  const b = marketManUtcDatePrefix(countEndUtc).replaceAll("/", "-");
  return `lazy-count:${a}__${b}`;
}

/** Parse MarketMan UTC to Date (interpreted as UTC wall time in the string). */
export function parseMarketManUtcToDate(s: string | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/.exec(
    s.trim(),
  );
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

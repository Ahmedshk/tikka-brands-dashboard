/**
 * Rich tooltip labels for sales trend charts (full calendar context from bucket keys).
 * X-axis labels may omit date (e.g. hourly shows only "2 PM"); tooltips always include date when possible.
 */
import { getStartOfDayUtc } from "./salesTrendDateRange.util.js";
import type { SalesTrendGranularity } from "./homebaseOrderedBuckets.util.js";

const HOURLY_BUCKET_KEY = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2})$/;
const YMD_BUCKET_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_KEY = /^(\d{4})-(\d{2})$/;

/** Parse hourly bucket key `YYYY-MM-DDTHH` to an instant in `timezone`. */
export function hourlyBucketKeyToDate(key: string, timezone: string): Date | null {
  const m = HOURLY_BUCKET_KEY.exec(key.trim());
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10) - 1;
  const d = Number.parseInt(m[3]!, 10);
  const h = Number.parseInt(m[4]!, 10);
  const tz = timezone.trim();
  const dayStart = getStartOfDayUtc(y, mo, d, tz);
  return new Date(dayStart.getTime() + h * 60 * 60 * 1000);
}

export function formatSalesTrendTooltipLabelFromBucketKey(
  key: string,
  granularity: SalesTrendGranularity,
  timezone: string,
): string {
  const tz = timezone.trim();
  if (granularity === "hourly") {
    const instant = hourlyBucketKeyToDate(key, tz);
    if (!instant) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(instant);
  }
  if (granularity === "daily" || granularity === "weekly") {
    const m = YMD_BUCKET_KEY.exec(key.trim());
    if (!m) return "";
    const y = Number.parseInt(m[1]!, 10);
    const mo = Number.parseInt(m[2]!, 10) - 1;
    const d = Number.parseInt(m[3]!, 10);
    const instant = getStartOfDayUtc(y, mo, d, tz);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(instant);
  }
  if (granularity === "monthly") {
    const m = YEAR_MONTH_KEY.exec(key.trim());
    if (!m) return "";
    const y = Number.parseInt(m[1]!, 10);
    const mo = Number.parseInt(m[2]!, 10) - 1;
    const instant = getStartOfDayUtc(y, mo, 1, tz);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "long",
      year: "numeric",
    }).format(instant);
  }
  return "";
}

import { formatInTimeZone } from "date-fns-tz";
import { businessDateKeyForInstant } from "./businessDayUtcRange.util.js";

/**
 * Business date key for a MarketMan `businessDateAt` (same window as daily rollups).
 * When `businessStartTime` is omitted, falls back to calendar date in TZ (legacy).
 */
export function marketManBusinessDateKeyFromUtcDate(
  utcDate: Date,
  timezone: string,
  businessStartTime?: string,
): string {
  const tz = timezone.trim() || "UTC";
  const bst = businessStartTime?.trim();
  if (bst) {
    return businessDateKeyForInstant(utcDate, tz, bst);
  }
  return formatInTimeZone(utcDate, tz, "yyyy-MM-dd");
}

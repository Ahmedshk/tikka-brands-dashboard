import { formatInTimeZone } from "date-fns-tz";

/**
 * Calendar date key in an IANA timezone, aligned with MarketMan order rollup aggregation
 * (`$dateToString` on `businessDateAt` in that timezone).
 */
export function marketManBusinessDateKeyFromUtcDate(
  utcDate: Date,
  timezone: string,
): string {
  const tz = timezone.trim() || "UTC";
  return formatInTimeZone(utcDate, tz, "yyyy-MM-dd");
}

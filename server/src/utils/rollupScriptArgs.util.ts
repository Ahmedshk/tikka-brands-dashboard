import { addDays, format, parseISO, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export interface RollupCliArgs {
  from?: string;
  to?: string;
  locationId?: string;
}

/**
 * Parse `--from`, `--to`, `--locationId` from argv (e.g. `process.argv.slice(2)`).
 */
export function parseRollupCliArgs(argv: string[]): RollupCliArgs {
  const out: RollupCliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") {
      const v = argv[++i]?.trim();
      if (v) out.from = v;
    } else if (a === "--to") {
      const v = argv[++i]?.trim();
      if (v) out.to = v;
    } else if (a === "--locationId") {
      const v = argv[++i]?.trim();
      if (v) out.locationId = v;
    }
  }
  return out;
}

/**
 * Inclusive list of `yyyy-MM-dd` keys from `fromKey` through `toKey` (lexicographic order matches chronological).
 */
export function iterBusinessDateKeysInclusive(
  fromKey: string,
  toKey: string,
): string[] {
  const from = fromKey.trim();
  const to = toKey.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error(
      `Invalid date keys (expected yyyy-MM-dd): from=${fromKey} to=${toKey}`,
    );
  }
  if (from > to) return [];
  const out: string[] = [];
  let cur = parseISO(`${from}T12:00:00.000Z`);
  const end = parseISO(`${to}T12:00:00.000Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return out;
}

/** Yesterday's calendar date in the given IANA timezone (for default rollup window). */
export function getYesterdayBusinessDateKeyInTimezone(timeZone: string): string {
  const tz = timeZone.trim() || "UTC";
  const ref = subDays(new Date(), 1);
  return formatInTimeZone(ref, tz, "yyyy-MM-dd");
}

/**
 * When CLI omits `--from`/`--to`, defaults to yesterday in `locationTimezone`.
 * Single-sided args expand so `from` only or `to` only still yields a valid inclusive range.
 */
export function resolveRollupDateRangeForLocation(
  args: RollupCliArgs,
  locationTimezone: string,
): { fromKey: string; toKey: string } {
  const fromArg = args.from?.trim();
  const toArg = args.to?.trim();
  if (fromArg && toArg) return { fromKey: fromArg, toKey: toArg };
  if (fromArg) return { fromKey: fromArg, toKey: toArg ?? fromArg };
  if (toArg) return { fromKey: toArg, toKey: toArg };
  const y = getYesterdayBusinessDateKeyInTimezone(locationTimezone);
  return { fromKey: y, toKey: y };
}

import { addDays, format, parseISO, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export interface RollupCliArgs {
  from?: string;
  to?: string;
  /**
   * Single location id when only one was passed; preserved for the existing
   * call sites that look up `args.locationId`. When the CLI receives multiple
   * ids (via repeated `--locationId` flags or a comma-separated value), all
   * ids land in `locationIds`; this field is set to the first id only when
   * exactly one id was provided.
   */
  locationId?: string;
  /**
   * Every location id provided on the CLI, de-duplicated in encounter order.
   * Empty/unset means "all locations". Accepts:
   *   --locationId a --locationId b   (repeated flag)
   *   --locationId a,b,c              (comma-separated)
   * Both forms can be mixed.
   */
  locationIds?: string[];
}

/**
 * Parse `--from`, `--to`, `--locationId` from argv (e.g. `process.argv.slice(2)`).
 *
 * `--locationId` can be:
 *   - omitted (script runs for every location)
 *   - a single id (existing behavior; `args.locationId` is set)
 *   - repeated multiple times, or comma-separated, or any mix — all ids land
 *     in `args.locationIds` and `args.locationId` stays unset when there is
 *     more than one.
 */
export function parseRollupCliArgs(argv: string[]): RollupCliArgs {
  const out: RollupCliArgs = {};
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") {
      const v = argv[++i]?.trim();
      if (v) out.from = v;
    } else if (a === "--to") {
      const v = argv[++i]?.trim();
      if (v) out.to = v;
    } else if (a === "--locationId" || a === "--locationIds") {
      const v = argv[++i]?.trim();
      if (!v) continue;
      for (const part of v.split(",")) {
        const trimmed = part.trim();
        if (trimmed && !ids.includes(trimmed)) ids.push(trimmed);
      }
    }
  }
  if (ids.length === 1 && ids[0] !== undefined) out.locationId = ids[0];
  if (ids.length > 0) out.locationIds = ids;
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

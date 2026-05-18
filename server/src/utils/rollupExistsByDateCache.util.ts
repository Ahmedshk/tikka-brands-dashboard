/**
 * Process-level cache for "does any hourly rollup row exist for
 * (location, businessDateKey)?".
 *
 * The cache is populated by the all-locations dashboard prefetch step via a
 * single bulk aggregate, and consulted by `tryGetOrderTimeSeriesFromHourly-
 * RollupsForKeys` so it can skip the per-location `exists()` round-trip
 * when we already know the answer.
 *
 * Empty (false) values are the common case early in the business day —
 * priming them lets the all-locations fan-out short-circuit ~18 Mongo
 * round-trips (9 locations × 2 ranges) per page load into one.
 *
 * - TTL: 60s (matches the rollup negative cache).
 * - Bounded: 1000 entries.
 * - Invalidated when a rollup is (re)built for a location.
 */

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 1000;

type Entry = { expiresAt: number; exists: boolean };

const cache = new Map<string, Entry>();

function buildKey(locationMongoId: string, businessDateKey: string): string {
  return `${locationMongoId}|${businessDateKey}`;
}

function evictExpired(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
}

function evictToCapacity(): void {
  while (cache.size > MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

export function readRollupExistsByDate(
  locationMongoId: string,
  businessDateKey: string,
): boolean | null {
  const now = Date.now();
  const k = buildKey(locationMongoId, businessDateKey);
  const entry = cache.get(k);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(k);
    return null;
  }
  return entry.exists;
}

export function writeRollupExistsByDate(
  locationMongoId: string,
  businessDateKey: string,
  exists: boolean,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const now = Date.now();
  evictExpired(now);
  const k = buildKey(locationMongoId, businessDateKey);
  cache.set(k, {
    expiresAt: now + Math.max(1_000, ttlMs),
    exists,
  });
  evictToCapacity();
}

/**
 * Best-effort invalidation when rollups are (re)built for a location.
 */
export function invalidateRollupExistsByDateForLocation(
  locationMongoId: string,
): void {
  const prefix = `${locationMongoId}|`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/** Test/diagnostic helper. */
export function _rollupExistsByDateCacheSize(): number {
  return cache.size;
}

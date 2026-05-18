/**
 * Short-lived in-memory negative cache for rollup read misses.
 *
 * Slow `rollupAttemptMs` (500-2600ms) is dominated by the full `$or` Mongo
 * scan even when no documents match. When the same (location, granularity,
 * range) is probed multiple times in close succession — common during the
 * fan-out across N locations for "All locations" dashboards — caching the
 * miss outcome saves repeated work.
 *
 * - TTL: 60s (process-local, single-instance dev / single dyno prod).
 * - Bounded: max 500 entries, evicted oldest-first when full.
 * - Cleared programmatically after a successful rollup build (best-effort).
 */

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 500;

type Entry = { expiresAt: number; reason: string; code: string };

const cache = new Map<string, Entry>();

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

export type RollupNegativeCacheKey = {
  locationMongoId: string;
  granularity: string;
  /** Stable, order-independent representation of the bucket keys. */
  rangeKey: string;
};

export function buildRangeKey(keys: readonly string[]): string {
  if (keys.length === 0) return "<empty>";
  const sorted = [...keys].sort((a, b) => a.localeCompare(b));
  return `${sorted[0]}..${sorted.at(-1)}|${sorted.length}`;
}

function toCacheKey(k: RollupNegativeCacheKey): string {
  return `${k.locationMongoId}|${k.granularity}|${k.rangeKey}`;
}

export function readRollupNegativeCache(
  key: RollupNegativeCacheKey,
): { reason: string; code: string } | null {
  const now = Date.now();
  const ck = toCacheKey(key);
  const entry = cache.get(ck);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(ck);
    return null;
  }
  return { reason: entry.reason, code: entry.code };
}

export function writeRollupNegativeCache(
  key: RollupNegativeCacheKey,
  miss: { reason: string; code: string },
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const now = Date.now();
  evictExpired(now);
  const ck = toCacheKey(key);
  cache.set(ck, {
    expiresAt: now + Math.max(1_000, ttlMs),
    reason: miss.reason,
    code: miss.code,
  });
  evictToCapacity();
}

/**
 * Best-effort invalidation when rollups have been (re)built for a location.
 * Pass `null` granularity to clear all granularities for that location.
 */
export function invalidateRollupNegativeCacheForLocation(
  locationMongoId: string,
  granularity?: string | null,
): void {
  const prefix = `${locationMongoId}|`;
  for (const k of cache.keys()) {
    if (!k.startsWith(prefix)) continue;
    if (granularity == null) {
      cache.delete(k);
      continue;
    }
    if (k.startsWith(`${locationMongoId}|${granularity}|`)) {
      cache.delete(k);
    }
  }
}

/** Test/diagnostic helper. */
export function _rollupNegativeCacheSize(): number {
  return cache.size;
}

/**
 * Short-lived in-memory negative caches for the dashboard read path.
 *
 * Two caches live here:
 *
 *  1. Rollup negative cache — slow `rollupAttemptMs` (500-2600ms) is dominated
 *     by the full `$or` Mongo scan even when no documents match. When the same
 *     (location, granularity, range) is probed multiple times in close
 *     succession — common during the fan-out across N locations for
 *     "All locations" dashboards — caching the miss outcome saves repeated
 *     work.
 *  2. Orders-empty cache — when the rollup probe misses and we fall through to
 *     a Mongo `SquareOrder` scan that returns zero rows, we've spent 500ms-7s
 *     to confirm "no data." Remember that empty result so the very next
 *     fan-out request can short-circuit before issuing the scan.
 *
 * Both caches:
 * - TTL: 60s (process-local, single-instance dev / single dyno prod).
 * - Bounded: max 500 entries each, evicted oldest-first when full.
 * - Cleared programmatically when new data lands (rollup build, order webhook).
 */

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 500;

type Entry = { expiresAt: number; reason: string; code: string };
type EmptyEntry = { expiresAt: number };

const cache = new Map<string, Entry>();
const ordersEmptyCache = new Map<string, EmptyEntry>();

function evictExpired(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
}

function evictExpiredOrdersEmpty(now: number): void {
  for (const [k, v] of ordersEmptyCache) {
    if (v.expiresAt <= now) ordersEmptyCache.delete(k);
  }
}

function evictToCapacity(): void {
  while (cache.size > MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

function evictOrdersEmptyToCapacity(): void {
  while (ordersEmptyCache.size > MAX_ENTRIES) {
    const firstKey = ordersEmptyCache.keys().next().value;
    if (firstKey === undefined) break;
    ordersEmptyCache.delete(firstKey);
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

export type OrdersEmptyCacheKey = {
  locationMongoId: string;
  /** Granularity or other axis label used to bucket the orders fetch (e.g. "hourly", "daily", "category"). */
  granularity: string;
  /** Stable, order-independent representation of the bucket keys (or range bounds). */
  rangeKey: string;
};

function toOrdersEmptyCacheKey(k: OrdersEmptyCacheKey): string {
  return `${k.locationMongoId}|${k.granularity}|${k.rangeKey}`;
}

export function readOrdersEmptyCache(key: OrdersEmptyCacheKey): boolean {
  const now = Date.now();
  const ck = toOrdersEmptyCacheKey(key);
  const entry = ordersEmptyCache.get(ck);
  if (!entry) return false;
  if (entry.expiresAt <= now) {
    ordersEmptyCache.delete(ck);
    return false;
  }
  return true;
}

export function writeOrdersEmptyCache(
  key: OrdersEmptyCacheKey,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const now = Date.now();
  evictExpiredOrdersEmpty(now);
  const ck = toOrdersEmptyCacheKey(key);
  ordersEmptyCache.set(ck, {
    expiresAt: now + Math.max(1_000, ttlMs),
  });
  evictOrdersEmptyToCapacity();
}

/**
 * Best-effort invalidation when a new Square order has landed (or any other
 * signal that the "no orders" assumption may no longer hold) for a location.
 * Pass `null` granularity to clear all granularities for that location.
 */
export function invalidateOrdersEmptyCacheForLocation(
  locationMongoId: string,
  granularity?: string | null,
): void {
  const prefix = `${locationMongoId}|`;
  for (const k of ordersEmptyCache.keys()) {
    if (!k.startsWith(prefix)) continue;
    if (granularity == null) {
      ordersEmptyCache.delete(k);
      continue;
    }
    if (k.startsWith(`${locationMongoId}|${granularity}|`)) {
      ordersEmptyCache.delete(k);
    }
  }
}

/** Test/diagnostic helper. */
export function _ordersEmptyCacheSize(): number {
  return ordersEmptyCache.size;
}

/**
 * Generic process-level cache keyed by `(locationMongoId, businessDateKey)`.
 *
 * Used by the all-locations dashboard prefetch step to memoize per-(location,
 * date) rollup rows so each per-location worker can build its result from
 * memory instead of issuing its own `find` to Mongo. The key shape matches
 * the unique index on every per-day rollup collection
 * (`SquareOrderDailyRollup`, `HomebaseTimecardDailyRollup`), so one entry =
 * one rollup row.
 *
 * Stored value `T` is the rollup doc, or `null` when we've confirmed no row
 * exists for that (location, date). Caller distinguishes "cached absent"
 * from "cache miss" via the `undefined` return.
 *
 * - Default TTL: 60s (rollup rows are stable until a write).
 * - Bounded LRU: oldest entries evicted when full.
 * - Invalidated by rollup builders + relevant webhook handlers.
 */

export interface PerLocationDateRollupCache<T> {
  /** `undefined` = not cached. `null` = cached "no row exists". `T` = cached row. */
  read(locationMongoId: string, businessDateKey: string): T | null | undefined;
  write(locationMongoId: string, businessDateKey: string, value: T | null): void;
  invalidateForLocation(locationMongoId: string): void;
  /** Test/diagnostic helper. */
  _size(): number;
}

export function createPerLocationDateRollupCache<T>(options?: {
  ttlMs?: number;
  maxEntries?: number;
}): PerLocationDateRollupCache<T> {
  const ttlMs = options?.ttlMs ?? 60_000;
  const maxEntries = options?.maxEntries ?? 5_000;
  type Entry = { expiresAt: number; value: T | null };
  const cache = new Map<string, Entry>();

  function key(locationMongoId: string, businessDateKey: string): string {
    return `${locationMongoId}|${businessDateKey}`;
  }

  function evictExpired(now: number): void {
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }

  function evictToCapacity(): void {
    while (cache.size > maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey === undefined) break;
      cache.delete(firstKey);
    }
  }

  return {
    read(locationMongoId, businessDateKey) {
      const k = key(locationMongoId, businessDateKey);
      const entry = cache.get(k);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        cache.delete(k);
        return undefined;
      }
      return entry.value;
    },
    write(locationMongoId, businessDateKey, value) {
      const now = Date.now();
      evictExpired(now);
      cache.set(key(locationMongoId, businessDateKey), {
        expiresAt: now + Math.max(1_000, ttlMs),
        value,
      });
      evictToCapacity();
    },
    invalidateForLocation(locationMongoId) {
      const prefix = `${locationMongoId}|`;
      for (const k of cache.keys()) {
        if (k.startsWith(prefix)) cache.delete(k);
      }
    },
    _size() {
      return cache.size;
    },
  };
}

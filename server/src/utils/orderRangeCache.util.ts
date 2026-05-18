/**
 * Short-TTL process-level cache for `loadSquareOrdersForMongoRange`.
 *
 * Purpose: when rollups are missing (dev / first-load), the Command Center
 * fires `kpis`, `hourly-sales`, and `alerts` in parallel and they each fall
 * back to the same Mongo `SquareOrder` range scan for the same
 * `(locationId, today-range)`. Without this cache that range is loaded 2–3
 * times per location per page hit.
 *
 * The cache stores:
 *  - An inflight `Promise<SquareOrder[]>` while a load is running (so siblings
 *    share the same Mongo round-trip).
 *  - The resolved result for a short window after completion (so requests
 *    arriving slightly later still avoid the scan).
 *
 * Safety:
 *  - Short TTL (default 20s) bounds staleness.
 *  - Only used for read paths that already accept rollup misses; behavior
 *    matches a freshly issued query within the TTL window.
 *  - On any internal error the cache silently falls through to the loader.
 */
import type { SquareOrder } from "../services/square.service.js";

type TimeRangeKeyParts = { startAt: string; endAt: string };

type CacheEntry = {
  /** Inflight loader; set while a load is running, cleared on settle. */
  inflight: Promise<SquareOrder[]> | null;
  /** Resolved orders kept for TTL window. */
  resolved: SquareOrder[] | null;
  /** Millisecond timestamp when `resolved` was last filled. */
  resolvedAt: number;
};

const TTL_MS = 20_000;
const MAX_ENTRIES = 256;

const cache = new Map<string, CacheEntry>();

function buildKey(locationMongoId: string, range: TimeRangeKeyParts): string {
  return `${locationMongoId}|${range.startAt}|${range.endAt}`;
}

function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
  const overflow = cache.size - MAX_ENTRIES;
  let evicted = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    evicted += 1;
    if (evicted >= overflow) break;
  }
}

function getFreshResolved(entry: CacheEntry, now: number): SquareOrder[] | null {
  if (entry.resolved == null) return null;
  if (now - entry.resolvedAt > TTL_MS) {
    entry.resolved = null;
    return null;
  }
  return entry.resolved;
}

/**
 * Run `loader` if no inflight or fresh result exists for this `(locationId,
 * range)`. Otherwise reuse the inflight Promise or fresh resolved result.
 */
export async function loadSquareOrdersForMongoRangeCached(
  locationMongoId: string,
  range: TimeRangeKeyParts,
  loader: () => Promise<SquareOrder[]>,
): Promise<SquareOrder[]> {
  const key = buildKey(locationMongoId, range);
  const now = Date.now();
  const existing = cache.get(key);

  if (existing) {
    if (existing.inflight != null) return existing.inflight;
    const fresh = getFreshResolved(existing, now);
    if (fresh) return fresh;
  }

  const entry: CacheEntry = existing ?? {
    inflight: null,
    resolved: null,
    resolvedAt: 0,
  };
  const promise = loader().then(
    (orders) => {
      entry.resolved = orders;
      entry.resolvedAt = Date.now();
      entry.inflight = null;
      return orders;
    },
    (err: unknown) => {
      entry.inflight = null;
      cache.delete(key);
      throw err;
    },
  );
  entry.inflight = promise;
  cache.set(key, entry);
  evictIfNeeded();
  return promise;
}

/**
 * Drop any cached orders for a location. Called after a rollup build / fresh
 * Square sync so stale orders aren't served past sync boundaries.
 */
export function invalidateOrderRangeCacheForLocation(locationMongoId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${locationMongoId}|`)) {
      cache.delete(key);
    }
  }
}

/** Test-only: clear all entries. */
export function _clearOrderRangeCacheForTests(): void {
  cache.clear();
}

/**
 * Short-TTL process-level cache for `loadHomebaseTimecardsForMongoRange`.
 *
 * Mirrors `orderRangeCache.util.ts` but for HomebaseTimecard documents.
 * Used by the all-locations dashboard handlers: one bulk Mongo query is
 * issued up-front for (locationId × union range), bucketed per location,
 * and seeded here. Subsequent per-location `loadHomebaseTimecardsForMongoRange`
 * calls become zero-round-trip cache hits.
 *
 * Safety:
 *  - Short TTL (20s) bounds staleness.
 *  - Invalidated on Homebase timecard webhook so a freshly clocked-in
 *    employee shows up immediately.
 */
import type { HomebaseTimecard } from "../services/homebase.service.js";

type TimeRangeKeyParts = { startAt: string; endAt: string };

type CacheEntry = {
  inflight: Promise<HomebaseTimecard[]> | null;
  resolved: HomebaseTimecard[] | null;
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

function getFreshResolved(entry: CacheEntry, now: number): HomebaseTimecard[] | null {
  if (entry.resolved == null) return null;
  if (now - entry.resolvedAt > TTL_MS) {
    entry.resolved = null;
    return null;
  }
  return entry.resolved;
}

export async function loadHomebaseTimecardsForMongoRangeCached(
  locationMongoId: string,
  range: TimeRangeKeyParts,
  loader: () => Promise<HomebaseTimecard[]>,
): Promise<HomebaseTimecard[]> {
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
    (cards) => {
      entry.resolved = cards;
      entry.resolvedAt = Date.now();
      entry.inflight = null;
      return cards;
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

export function primeTimecardRangeCache(
  locationMongoId: string,
  range: TimeRangeKeyParts,
  cards: HomebaseTimecard[],
): void {
  const key = buildKey(locationMongoId, range);
  const existing = cache.get(key);
  if (existing?.inflight != null) return;
  const entry: CacheEntry = existing ?? {
    inflight: null,
    resolved: null,
    resolvedAt: 0,
  };
  entry.resolved = cards;
  entry.resolvedAt = Date.now();
  entry.inflight = null;
  cache.set(key, entry);
  evictIfNeeded();
}

export function invalidateTimecardRangeCacheForLocation(locationMongoId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${locationMongoId}|`)) {
      cache.delete(key);
    }
  }
}

/** Test-only: clear all entries. */
export function _clearTimecardRangeCacheForTests(): void {
  cache.clear();
}

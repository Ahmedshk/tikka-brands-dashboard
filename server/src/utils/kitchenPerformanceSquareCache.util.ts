/**
 * Process-level cache for kitchen performance Square report results.
 * TTL aligns with Square KDS freshness (~15 minutes).
 */
import type {
  KitchenPerformanceDetailsResult,
  KitchenPerformanceRowDto,
} from "../types/kitchenPerformance.types.js";

type CacheEntry<T> = {
  inflight: Promise<T> | null;
  resolved: T | null;
  resolvedAt: number;
};

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 512;

const listCache = new Map<string, CacheEntry<KitchenPerformanceRowDto[]>>();
const detailsCache = new Map<string, CacheEntry<KitchenPerformanceDetailsResult>>();
const modifiersCache = new Map<
  string,
  CacheEntry<Record<string, Record<string, string[]>>>
>();

function evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>): void {
  if (cache.size <= MAX_ENTRIES) return;
  const overflow = cache.size - MAX_ENTRIES;
  let evicted = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    evicted += 1;
    if (evicted >= overflow) break;
  }
}

function getFreshResolved<T>(entry: CacheEntry<T>, now: number): T | null {
  if (entry.resolved == null) return null;
  if (now - entry.resolvedAt > TTL_MS) {
    entry.resolved = null;
    return null;
  }
  return entry.resolved;
}

async function loadCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);

  if (existing) {
    if (existing.inflight != null) return existing.inflight;
    const fresh = getFreshResolved(existing, now);
    if (fresh) return fresh;
  }

  const entry: CacheEntry<T> = existing ?? {
    inflight: null,
    resolved: null,
    resolvedAt: 0,
  };

  const promise = loader().then(
    (value) => {
      entry.resolved = value;
      entry.resolvedAt = Date.now();
      entry.inflight = null;
      return value;
    },
    (err: unknown) => {
      entry.inflight = null;
      cache.delete(key);
      throw err;
    },
  );
  entry.inflight = promise;
  cache.set(key, entry);
  evictIfNeeded(cache);
  return promise;
}

export function buildKitchenPerformanceListCacheKey(
  mongoLocationId: string,
  startDate: string,
  endDate: string,
): string {
  return `list|${mongoLocationId}|${startDate}|${endDate}`;
}

export function buildKitchenPerformanceDetailsCacheKey(
  mongoLocationId: string,
  startDate: string,
  endDate: string,
  deviceName: string,
): string {
  return `details|${mongoLocationId}|${startDate}|${endDate}|${deviceName}`;
}

export function buildKitchenPerformanceModifiersCacheKey(
  mongoLocationId: string,
  startDate: string,
  endDate: string,
  orderIds: string[],
): string {
  const sorted = [...orderIds].sort().join(",");
  return `modifiers|${mongoLocationId}|${startDate}|${endDate}|${sorted}`;
}

export function loadKitchenPerformanceListCached(
  key: string,
  loader: () => Promise<KitchenPerformanceRowDto[]>,
): Promise<KitchenPerformanceRowDto[]> {
  return loadCached(listCache, key, loader);
}

export function loadKitchenPerformanceDetailsCached(
  key: string,
  loader: () => Promise<KitchenPerformanceDetailsResult>,
): Promise<KitchenPerformanceDetailsResult> {
  return loadCached(detailsCache, key, loader);
}

export function loadKitchenPerformanceModifiersCached(
  key: string,
  loader: () => Promise<Record<string, Record<string, string[]>>>,
): Promise<Record<string, Record<string, string[]>>> {
  return loadCached(modifiersCache, key, loader);
}

/** Test-only: clear all entries. */
export function _clearKitchenPerformanceSquareCacheForTests(): void {
  listCache.clear();
  detailsCache.clear();
  modifiersCache.clear();
}

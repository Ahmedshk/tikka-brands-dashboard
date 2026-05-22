/**
 * Process-level (cross-request) cache for `locationService.getByIdWithCredentials`.
 *
 * The per-request cache ({@link perRequestCache.util.ts}) only dedupes within a
 * single HTTP request. When a dashboard page fans out into 3 concurrent
 * endpoints (kpis, hourly-breakdown, timesheet) each spawning 9 per-location
 * workers, that's 27 simultaneous `getByIdWithCredentials` calls for the same
 * 9 locations — 27 Mongo round-trips and 18 of them wasted.
 *
 * This module adds:
 *   1. A short-TTL value cache so repeated calls within the TTL window skip
 *      the Mongo + decrypt + logo-enrich pipeline entirely.
 *   2. In-flight deduplication so concurrent callers share a single resolution
 *      promise instead of issuing parallel duplicate lookups.
 *
 * TTL is intentionally short (default 60s) — credentials change rarely but we
 * don't want a stale entry pinned for hours after an admin rotates a key.
 * Cache invalidation hook (`invalidateLocationCredentials`) is exposed for
 * explicit busts when location updates land.
 */
import type { LocationService } from "../services/location.service.js";

type LocationWithCredentials = Awaited<
  ReturnType<LocationService["getByIdWithCredentials"]>
>;

interface CacheEntry {
  /** Resolved value (null when location not found). */
  value: LocationWithCredentials;
  /** Epoch ms when this entry should no longer be served from the value cache. */
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;
const TTL_MS = (() => {
  const raw = process.env.LOCATION_CREDS_CACHE_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS;
})();

const valueCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<LocationWithCredentials>>();

/**
 * Fetch a location's credentials, sharing the underlying Mongo call across
 * concurrent callers and caching the result for a short TTL.
 */
export async function getLocationWithCredentialsCachedAcrossRequests(
  locationService: LocationService,
  locationId: string,
): Promise<LocationWithCredentials> {
  const now = Date.now();
  const cached = valueCache.get(locationId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const existing = inFlight.get(locationId);
  if (existing) return existing;

  const promise = locationService
    .getByIdWithCredentials(locationId)
    .then((value) => {
      valueCache.set(locationId, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .finally(() => {
      inFlight.delete(locationId);
    });
  inFlight.set(locationId, promise);
  return promise;
}

/**
 * Drop a cached entry. Call after location updates / credential rotations so
 * the next request fetches fresh data instead of waiting up to TTL_MS for
 * the entry to expire naturally.
 */
export function invalidateLocationCredentials(locationId: string): void {
  valueCache.delete(locationId);
}

/** Clear every entry. For tests + manual ops scripts. */
export function clearLocationCredentialsCache(): void {
  valueCache.clear();
}

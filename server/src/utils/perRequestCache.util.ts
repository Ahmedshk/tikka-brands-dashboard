/**
 * Per-Express-request memoization cache.
 *
 * Stores values on a hidden property of the `Request` object so they live for
 * the duration of one HTTP request and are garbage-collected when the request
 * ends. Used to avoid duplicate DB reads (location creds, goals, etc.) when
 * the same lookup is performed multiple times by different code paths within
 * the same request.
 */
import type { Request } from "express";
import type { LocationService } from "../services/location.service.js";

const CACHE_KEY = Symbol.for("tikka.perRequestCache");

type CacheBag = Map<string, unknown>;

type CarrierRequest = Request & { [CACHE_KEY]?: CacheBag };

function getBag(req: Request): CacheBag {
  const carrier = req as CarrierRequest;
  let bag = carrier[CACHE_KEY];
  if (!bag) {
    bag = new Map<string, unknown>();
    carrier[CACHE_KEY] = bag;
  }
  return bag;
}

/**
 * Memoize an async loader for the lifetime of this request.
 * Subsequent calls with the same `key` return the cached promise/value.
 */
export async function memoForRequest<T>(
  req: Request,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const bag = getBag(req);
  if (bag.has(key)) {
    return bag.get(key) as T;
  }
  const promise = loader();
  bag.set(key, promise);
  try {
    const value = await promise;
    bag.set(key, value);
    return value;
  } catch (err) {
    bag.delete(key);
    throw err;
  }
}

/**
 * Cached `locationService.getByIdWithCredentials` keyed by location id.
 * Returns the same resolved value across all calls within one request.
 */
export function getByIdWithCredentialsCached(
  req: Request,
  locationService: LocationService,
  locationId: string,
): Promise<Awaited<ReturnType<LocationService["getByIdWithCredentials"]>>> {
  return memoForRequest(req, `loc-creds:${locationId}`, () =>
    locationService.getByIdWithCredentials(locationId),
  );
}

/**
 * Cached `locationService.getById` keyed by location id.
 */
export function getByIdCached(
  req: Request,
  locationService: LocationService,
  locationId: string,
): Promise<Awaited<ReturnType<LocationService["getById"]>>> {
  return memoForRequest(req, `loc:${locationId}`, () =>
    locationService.getById(locationId),
  );
}

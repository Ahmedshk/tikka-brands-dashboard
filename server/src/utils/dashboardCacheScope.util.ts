/**
 * Stable `locationScope` strings for `DashboardCache` keys.
 *
 * Two users with the same effective allow-list share a cache entry; two users
 * with different allow-lists end up with different scope strings and don't
 * collide. The all-locations case for the common "user can see every
 * location" tenant produces one shared scope across all such users.
 */
import crypto from "node:crypto";
import type { Request } from "express";
import {
  ALL_LOCATIONS_ID,
  isAllLocationsRequest,
  resolveEffectiveAllowedLocationIds,
  getLocationIdFromRequest,
} from "./locationScope.js";

function hashIdList(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  return crypto
    .createHash("sha1")
    .update(sorted.join(","))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Resolve the `locationScope` cache-key segment for an incoming request.
 *  - Single-location request → the location id itself.
 *  - All-locations request → `__all__|<sha1 of sorted effective ids>` so
 *    permission differences produce distinct cache entries.
 */
export async function resolveLocationScopeForRequest(req: Request): Promise<string> {
  if (isAllLocationsRequest(req)) {
    const ids = await resolveEffectiveAllowedLocationIds(req);
    return `${ALL_LOCATIONS_ID}|${hashIdList(ids)}`;
  }
  const single = getLocationIdFromRequest(req);
  return single ?? ALL_LOCATIONS_ID;
}

/**
 * Compute a `locationScope` directly from a list of ids. Used by the cron
 * job to construct the same key the user-facing path would produce.
 */
export function locationScopeForIds(ids: readonly string[]): string {
  return `${ALL_LOCATIONS_ID}|${hashIdList(ids)}`;
}

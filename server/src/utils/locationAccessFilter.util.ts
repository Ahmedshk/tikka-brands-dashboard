import type { LocationListFilter } from '../repositories/location.repository.js';

/** The location-access fields `auth.middleware` attaches to `req.user`. */
export interface RequestUserLocationAccess {
  /** Resolved from Role.locations: 'all' or an explicit allow-list. */
  allowedLocationIds?: 'all' | string[];
  /** Location ids denied for this user, applied after the allow-list. */
  locationRemovals?: string[];
}

/**
 * Narrow a location query to what the requesting user may see.
 *
 * `allowedLocationIds === 'all'` means unrestricted, so it deliberately
 * produces no `$in` clause; removals still apply. Shared by `GET /locations`
 * and `GET /location-groups` so the header selector can never show a location
 * under a group that the plain location list would have hidden.
 */
export function locationListFilterForUser(
  user: RequestUserLocationAccess | undefined,
): LocationListFilter | undefined {
  const allowed = user?.allowedLocationIds;
  const removals = user?.locationRemovals ?? [];
  const hasAllowed = Array.isArray(allowed);
  const hasExclude = removals.length > 0;
  if (!hasAllowed && !hasExclude) return undefined;
  return {
    ...(hasAllowed ? { allowedIds: allowed as string[] } : {}),
    ...(hasExclude ? { excludeIds: removals } : {}),
  };
}

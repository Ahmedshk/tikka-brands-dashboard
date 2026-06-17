import type { Request } from 'express';
import { LocationModel } from '../models/location.model.js';
import { ForbiddenError } from './errors.util.js';

export const ALL_LOCATIONS_ID = '__all__';

export function isAllLocationsId(id: string | null | undefined): boolean {
  return id === ALL_LOCATIONS_ID;
}

export function getLocationIdFromRequest(req: Request): string | null {
  const q = typeof req.query.locationId === 'string' ? req.query.locationId.trim() : '';
  if (q) return q;
  const p = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (p) return p;
  return null;
}

export function isAllLocationsRequest(req: Request): boolean {
  return isAllLocationsId(getLocationIdFromRequest(req));
}

function parseLocationIdsValue(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Read explicit multi-location ids from `locationIds` query (comma-separated or repeated). */
export function parseLocationIdsFromQuery(req: Request): string[] {
  return parseLocationIdsValue(req.query.locationIds);
}

export function isMultiLocationRequest(req: Request): boolean {
  const explicit = parseLocationIdsFromQuery(req);
  if (explicit.length > 0) return true;
  return isAllLocationsRequest(req);
}

/**
 * Unified resolver for which location ids a request should target.
 * 1. `locationIds` query → intersect with user's effective allow list
 * 2. `locationId === __all__` → all allowed ids
 * 3. else → single `[locationId]`
 */
export async function resolveTargetLocationIds(req: Request): Promise<string[]> {
  const explicit = parseLocationIdsFromQuery(req);
  if (explicit.length > 0) {
    const allowed = await resolveEffectiveAllowedLocationIds(req);
    const allowedSet = new Set(allowed);
    const filtered: string[] = [];
    const seen = new Set<string>();
    for (const id of explicit) {
      if (!allowedSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      filtered.push(id);
    }
    if (filtered.length === 0) {
      throw new ForbiddenError('You do not have access to the requested locations.');
    }
    return filtered;
  }

  const locationId = getLocationIdFromRequest(req);
  if (!locationId) return [];

  if (isAllLocationsId(locationId)) {
    return resolveEffectiveAllowedLocationIds(req);
  }

  return [locationId];
}

async function getAllLocationIds(): Promise<string[]> {
  const docs = await LocationModel.find({}).select({ _id: 1 }).lean().exec();
  return docs.map((d) => String(d._id));
}

/**
 * Resolve the effective list of Mongo location ids the user can access,
 * taking into account:
 * - role-scoped allow list (or 'all')
 * - user overrides already merged into allowedLocationIds
 * - user removals (deny list)
 */
export async function resolveEffectiveAllowedLocationIds(req: Request): Promise<string[]> {
  const allowed = req.user?.allowedLocationIds;
  const removals = req.user?.locationRemovals ?? [];
  const removalSet = new Set(removals.map((r) => String(r).trim()).filter(Boolean));

  let base: string[];
  if (allowed === 'all') {
    base = await getAllLocationIds();
  } else if (Array.isArray(allowed)) {
    base = allowed.map((a) => String(a).trim()).filter(Boolean);
  } else {
    base = [];
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of base) {
    if (removalSet.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}


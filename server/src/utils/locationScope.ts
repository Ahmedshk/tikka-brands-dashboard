import type { Request } from 'express';
import { LocationModel } from '../models/location.model.js';

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


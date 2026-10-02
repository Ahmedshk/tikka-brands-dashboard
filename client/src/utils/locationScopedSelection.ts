import type { LocationGroupBucket, BucketedLocations } from './locationGroupHelpers';

export type LocationSelectionScopes = Record<string, string[]>;
export const UNGROUPED_SCOPE = '__ungrouped__';

/** Reporting receives the union, while checkboxes retain their group of origin. */
export function selectedIdsFromScopes(scopes: LocationSelectionScopes): string[] {
  return [...new Set(Object.values(scopes).flat())];
}

export function normalizeSelectionScopes(scopes: LocationSelectionScopes, allowedIds: readonly string[]): LocationSelectionScopes {
  const allowed = new Set(allowedIds);
  const out: LocationSelectionScopes = {};
  for (const [scope, ids] of Object.entries(scopes)) {
    const normalized = [...new Set(ids.filter(id => allowed.has(id)))];
    if (normalized.length) out[scope] = normalized;
  }
  return out;
}

/** Old saved selections have no group identity; assign each ID to one visible section. */
export function resolveSelectionScopes(
  selectedIds: readonly string[],
  scopes: LocationSelectionScopes | null,
  buckets: BucketedLocations,
): LocationSelectionScopes {
  const selected = new Set(selectedIds);
  const out: LocationSelectionScopes = {};
  const sections = [...buckets.groups.map(bucket => ({ scope: bucket.group._id, ids: bucket.locations.map(l => l._id) })),
    { scope: UNGROUPED_SCOPE, ids: buckets.ungrouped.map(l => l._id) }];
  if (scopes) {
    for (const { scope, ids } of sections) {
      const matches = ids.filter(id => selected.has(id) && scopes[scope]?.includes(id));
      if (matches.length) out[scope] = matches;
    }
  }
  const assigned = new Set(selectedIdsFromScopes(out));
  const exactGroup = scopes == null ? sections.find(section => section.ids.length === selected.size && section.ids.every(id => selected.has(id))) : undefined;
  for (const id of selectedIds) {
    if (assigned.has(id)) continue;
    const section = exactGroup ?? sections.find(section => section.ids.includes(id));
    if (section) (out[section.scope] ??= []).push(id);
  }
  return out;
}

export function toggleScopeMembers(scopes: LocationSelectionScopes, scope: string, memberIds: readonly string[]): LocationSelectionScopes {
  const current = new Set(scopes[scope] ?? []);
  const allSelected = memberIds.every(id => current.has(id));
  for (const id of memberIds) {
    if (allSelected) current.delete(id);
    else current.add(id);
  }
  const next = { ...scopes };
  if (current.size) next[scope] = [...current];
  else delete next[scope];
  return next;
}

/** Only name a group when the selection actually comes entirely from that group. */
export function selectionLabelBuckets(scopes: LocationSelectionScopes, buckets: readonly LocationGroupBucket[]): LocationGroupBucket[] {
  const active = Object.keys(scopes).filter(key => scopes[key]!.length > 0);
  return active.length === 1 ? buckets.filter(bucket => bucket.group._id === active[0]) : [];
}

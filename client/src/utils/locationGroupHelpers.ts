import type { LocationGroup, LocationListItem } from '../types';

/** A group bucket with the locations that belong to it, in list order. */
export interface LocationGroupBucket {
  group: LocationGroup;
  locations: LocationListItem[];
}

export interface BucketedLocations {
  /** Groups in server-supplied sortOrder, each with a non-empty member list. */
  groups: LocationGroupBucket[];
  /** Locations in no group, or in a group this user cannot populate. */
  ungrouped: LocationListItem[];
}

export type GroupCheckboxState = 'checked' | 'unchecked' | 'indeterminate';

/**
 * Bucket a permission-filtered location list by group.
 *
 * `locations` is already narrowed to what the user may see and `groups` already
 * carries only the member ids they may see, so a location missing from every
 * group is genuinely ungrouped from this user's perspective. Members are
 * emitted in the incoming list order so the existing location sortOrder is
 * preserved inside each bucket.
 *
 * Groups that end up with no visible members are omitted, so a header is never
 * rendered with nothing under it.
 */
export function bucketLocationsByGroup(
  locations: readonly LocationListItem[],
  groups: readonly LocationGroup[],
): BucketedLocations {
  const claimed = new Set<string>();
  const out: LocationGroupBucket[] = [];

  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const group of ordered) {
    const members: LocationListItem[] = [];
    for (const loc of locations) {
      if (claimed.has(loc._id)) continue;
      if (!group.locationIds.includes(loc._id)) continue;
      claimed.add(loc._id);
      members.push(loc);
    }
    if (members.length === 0) continue;
    out.push({ group, locations: members });
  }

  return {
    groups: out,
    ungrouped: locations.filter((l) => !claimed.has(l._id)),
  };
}

/** Tri-state for a group header checkbox derived from the member selection. */
export function groupCheckboxState(
  selectedIds: readonly string[],
  memberIds: readonly string[],
): GroupCheckboxState {
  if (memberIds.length === 0) return 'unchecked';
  const selected = new Set(selectedIds);
  let hits = 0;
  for (const id of memberIds) {
    if (selected.has(id)) hits += 1;
  }
  if (hits === 0) return 'unchecked';
  if (hits === memberIds.length) return 'checked';
  return 'indeterminate';
}

/**
 * Selection produced by toggling a group header.
 *
 * Checking adds every member while keeping the rest of the selection; unchecking
 * removes them. The caller owns the "never empty" rule (the Redux reducers
 * already enforce at least one selected location), so this stays a pure
 * add/remove.
 */
export function toggleGroupMembers(
  selectedIds: readonly string[],
  memberIds: readonly string[],
): string[] {
  const members = new Set(memberIds);
  const allSelected = groupCheckboxState(selectedIds, memberIds) === 'checked';
  const out = selectedIds.filter((id) => !members.has(id));
  if (allSelected) return out;
  const seen = new Set(out);
  for (const id of memberIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Group name for a selection that is exactly one whole group, else null.
 *
 * "Exactly one group" means every accessible member of that group is selected and
 * nothing outside it is — a partial selection must not read as a whole group that
 * was never actually chosen.
 *
 * Note a single-member group does match here (selecting its only location *is*
 * selecting that group). `formatLocationTriggerLabel` deliberately calls this
 * only for selections of more than one, so a lone location still shows its
 * store name; callers wanting the stricter behaviour must check the size.
 */
/**
 * Membership writes needed to turn a group's current members into `locationIds`.
 *
 * Kept separate from the modal so the diff is testable without a component, and
 * so a location can never be left in two groups: everything checked but not
 * current is added, everything current but unchecked is released to Ungrouped.
 */
export function planGroupMembership(
  currentMemberIds: readonly string[],
  locationIds: readonly string[],
): { toAdd: string[]; toRelease: string[] } {
  const current = new Set(currentMemberIds);
  const next = new Set(locationIds);
  return {
    toAdd: locationIds.filter((id) => !current.has(id)),
    toRelease: currentMemberIds.filter((id) => !next.has(id)),
  };
}

export function findGroupNameForSelection(
  selectedIds: readonly string[],
  buckets: readonly LocationGroupBucket[],
): string | null {
  if (selectedIds.length === 0) return null;
  const selected = new Set(selectedIds);
  for (const bucket of buckets) {
    const memberIds = bucket.locations.map((l) => l._id);
    if (memberIds.length === 0 || memberIds.length !== selectedIds.length) continue;
    if (memberIds.every((id) => selected.has(id))) return bucket.group.name;
  }
  return null;
}

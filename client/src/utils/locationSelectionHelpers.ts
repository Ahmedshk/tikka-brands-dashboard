import type { LocationListItem } from '../types';
import {
  findGroupNameForSelection,
  type LocationGroupBucket,
} from './locationGroupHelpers';

export const ALL_LOCATIONS_ID = '__all__';

export const MULTI_LOCATIONS_PREFIX = '__multi__:';

/**
 * Stored marker for a deliberately empty selection.
 *
 * Needed to tell "the user unchecked everything" apart from "first visit, no
 * preference stored". Without it, clearing the selection would drop the storage
 * key entirely and the next load would silently default to the first location.
 */
export const EMPTY_SELECTION_MARKER = '__none__';

export function isMultiLocationsStoredId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(MULTI_LOCATIONS_PREFIX);
}

export function serializeSelectedLocationIds(ids: readonly string[]): string {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
  // Persist an explicit marker rather than an empty string so a cleared
  // selection survives a reload; see EMPTY_SELECTION_MARKER.
  if (unique.length === 0) return EMPTY_SELECTION_MARKER;
  if (unique.length === 1) return unique[0]!;
  return `${MULTI_LOCATIONS_PREFIX}${unique.join(',')}`;
}

export function parseStoredLocationSelection(
  stored: string | null,
  availableIds: readonly string[],
): string[] {
  // No stored preference at all — first visit, so default to the first location.
  if (stored == null || stored === '') {
    return defaultInitialSelection([], availableIds);
  }
  // Explicitly cleared by the user: respect it.
  if (stored === EMPTY_SELECTION_MARKER) {
    return normalizeSelection([], availableIds);
  }
  if (stored === ALL_LOCATIONS_ID) {
    return normalizeSelection([...availableIds], availableIds);
  }
  if (isMultiLocationsStoredId(stored)) {
    const raw = stored.slice(MULTI_LOCATIONS_PREFIX.length);
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    // A stored selection that no longer resolves (locations deleted, or access
    // revoked) falls back to the first available rather than stranding the user
    // on an empty prompt — that is different from a deliberate clear above.
    return defaultInitialSelection(ids, availableIds);
  }
  return defaultInitialSelection([stored], availableIds);
}

/**
 * Dedupe and keep only ids that are actually available.
 *
 * Deliberately does NOT enforce a non-empty result: an empty selection is a
 * valid state the user can reach by unchecking everything, and pages render a
 * "select a location" prompt for it. A default-to-first location is applied once
 * at catalog load (see `defaultInitialSelection`) rather than here, so a catalog
 * refresh cannot resurrect a selection the user cleared.
 */
export function normalizeSelection(
  ids: readonly string[],
  availableIds: readonly string[],
): string[] {
  const allow = new Set(availableIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || !allow.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Selection to use on first load when nothing usable is stored.
 *
 * Picking the first location keeps a first-time visitor on a populated page
 * instead of an empty prompt. This is the ONLY place a non-empty selection is
 * invented; once the user clears the selection, `normalizeSelection` preserves
 * that emptiness across reloads and catalog refreshes.
 */
export function defaultInitialSelection(
  storedSelection: readonly string[],
  availableIds: readonly string[],
): string[] {
  const normalized = normalizeSelection(storedSelection, availableIds);
  if (normalized.length > 0) return normalized;
  return availableIds.length > 0 ? [availableIds[0]!] : [];
}

export type LocationApiParams = {
  locationId?: string;
  locationIds?: string[];
};

export function buildLocationApiParams(
  selectedIds: readonly string[],
  totalAvailable: number,
): LocationApiParams {
  const unique = [...new Set(selectedIds)];
  if (unique.length === 0) return {};
  if (totalAvailable > 0 && unique.length === totalAvailable) {
    return { locationId: ALL_LOCATIONS_ID };
  }
  if (unique.length === 1) {
    return { locationId: unique[0]! };
  }
  return { locationIds: unique };
}

/**
 * Header button text.
 *
 * When the selection is exactly one whole group, `buckets` supplies that group's
 * name so clicking a group reads as "West Coast" rather than "4 locations". The
 * param is optional because both the sidebar and the dropdown button render this
 * label, and only the dropdown has the bucketed list to hand.
 */
export function formatLocationTriggerLabel(
  selectedIds: readonly string[],
  locations: readonly LocationListItem[],
  totalAvailable: number,
  buckets?: readonly LocationGroupBucket[],
): string {
  if (locations.length === 0) return 'No locations';
  // Nothing selected is a valid state; prompt rather than showing a stale name.
  if (selectedIds.length === 0) return 'Select location';
  if (totalAvailable > 0 && selectedIds.length === totalAvailable) return 'All';
  if (selectedIds.length === 1) {
    const match = locations.find((l) => l._id === selectedIds[0]);
    return match?.storeName ?? 'Select location';
  }
  if (selectedIds.length > 1) {
    if (buckets) {
      const groupName = findGroupNameForSelection(selectedIds, buckets);
      if (groupName != null) return groupName;
    }
    return `${selectedIds.length} locations`;
  }
  return 'Select location';
}

export function isAllLocationsSelection(
  selectedIds: readonly string[],
  totalAvailable: number,
): boolean {
  return totalAvailable > 0 && selectedIds.length === totalAvailable;
}

/**
 * Result of clicking the dropdown's "Select all" checkbox.
 *
 * Toggles between every location and none. It previously collapsed to the first
 * location when everything was checked, a workaround for the old rule that an
 * empty selection was unreachable; now that empty is a supported state, an
 * explicit uncheck clears rather than silently keeping one.
 */
export function toggleAllLocationsSelection(
  selectedIds: readonly string[],
  allAvailableIds: readonly string[],
): string[] {
  if (isAllLocationsSelection(selectedIds, allAvailableIds.length)) return [];
  return [...allAvailableIds];
}

export function isMultiLocationView(selectedIds: readonly string[]): boolean {
  return selectedIds.length > 1;
}

export function locationApiParamsToQueryRecord(
  params: LocationApiParams,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (params.locationId) out.locationId = params.locationId;
  if (params.locationIds?.length) out.locationIds = params.locationIds.join(',');
  return out;
}

export function resolveLocationQuery(
  input: LocationApiParams | string,
): Record<string, string> {
  if (typeof input === 'string') {
    return input.trim() ? { locationId: input.trim() } : {};
  }
  return locationApiParamsToQueryRecord(input);
}

export function hasLocationSelection(params: LocationApiParams): boolean {
  return Boolean(params.locationId) || Boolean(params.locationIds?.length);
}

/** Review cycles: omit location params when all locations are selected. */
export function reviewCycleLocationQueryParams(
  apiParams: LocationApiParams,
  allLocationsSelected: boolean,
): Record<string, string> {
  if (allLocationsSelected) return {};
  return locationApiParamsToQueryRecord(apiParams);
}

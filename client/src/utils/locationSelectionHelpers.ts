import type { LocationListItem } from '../types';

export const ALL_LOCATIONS_ID = '__all__';

export const MULTI_LOCATIONS_PREFIX = '__multi__:';

export function isMultiLocationsStoredId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(MULTI_LOCATIONS_PREFIX);
}

export function serializeSelectedLocationIds(ids: readonly string[]): string {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0]!;
  return `${MULTI_LOCATIONS_PREFIX}${unique.join(',')}`;
}

export function parseStoredLocationSelection(
  stored: string | null,
  availableIds: readonly string[],
): string[] {
  if (!stored) return normalizeSelection([], availableIds);
  if (stored === ALL_LOCATIONS_ID) {
    return normalizeSelection([...availableIds], availableIds);
  }
  if (isMultiLocationsStoredId(stored)) {
    const raw = stored.slice(MULTI_LOCATIONS_PREFIX.length);
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return normalizeSelection(ids, availableIds);
  }
  return normalizeSelection([stored], availableIds);
}

/** Dedupe, keep only available ids, enforce at least one when possible. */
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
  if (out.length === 0 && availableIds.length > 0) {
    return [availableIds[0]!];
  }
  return out;
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

export function formatLocationTriggerLabel(
  selectedIds: readonly string[],
  locations: readonly LocationListItem[],
  totalAvailable: number,
): string {
  if (locations.length === 0) return 'No locations';
  if (totalAvailable > 0 && selectedIds.length === totalAvailable) return 'All';
  if (selectedIds.length === 1) {
    const match = locations.find((l) => l._id === selectedIds[0]);
    return match?.storeName ?? 'Select location';
  }
  if (selectedIds.length > 1) {
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

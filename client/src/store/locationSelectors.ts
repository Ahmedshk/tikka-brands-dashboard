import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { LocationListItem } from '../types';
import {
  buildLocationApiParams,
  isAllLocationsSelection,
  isMultiLocationView,
  type LocationApiParams,
} from '../utils/locationSelectionHelpers';

export function selectSelectedLocationIds(state: RootState): string[] {
  return state.location.selectedLocationIds;
}

export function selectAvailableLocationCount(state: RootState): number {
  return state.location.availableLocationCount;
}

export function selectIsMultiLocationView(state: RootState): boolean {
  return isMultiLocationView(state.location.selectedLocationIds);
}

export function selectAllLocationsSelected(state: RootState): boolean {
  return isAllLocationsSelection(
    state.location.selectedLocationIds,
    state.location.availableLocationCount,
  );
}

export function selectCurrentLocation(state: RootState): LocationListItem | null {
  const { selectedLocationIds, locationById } = state.location;
  if (selectedLocationIds.length !== 1) return null;
  return locationById[selectedLocationIds[0]!] ?? null;
}

const selectSelectedLocationIdsState = (state: RootState) => state.location.selectedLocationIds;
const selectAvailableLocationCountState = (state: RootState) => state.location.availableLocationCount;
const selectLocationByIdState = (state: RootState) => state.location.locationById;

/** Navbar-selected locations resolved to catalog items (stable order: selection order). */
export const selectSelectedLocations = createSelector(
  [selectSelectedLocationIdsState, selectLocationByIdState],
  (selectedLocationIds, locationById): LocationListItem[] =>
    selectedLocationIds
      .map((id) => locationById[id])
      .filter((loc): loc is LocationListItem => loc != null),
);

/** Memoized — stable object reference when selection/count unchanged (safe in useEffect deps). */
export const selectLocationApiParams = createSelector(
  [selectSelectedLocationIdsState, selectAvailableLocationCountState],
  (selectedLocationIds, availableLocationCount): LocationApiParams =>
    buildLocationApiParams(selectedLocationIds, availableLocationCount),
);

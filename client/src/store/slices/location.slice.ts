import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LocationListItem } from '../../types';
import {
  normalizeSelection,
  parseStoredLocationSelection,
  serializeSelectedLocationIds,
  ALL_LOCATIONS_ID,
} from '../../utils/locationSelectionHelpers';

const STORAGE_KEY = 'tikka_current_location_id';

export { ALL_LOCATIONS_ID };

function getStoredLocationId(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredLocationId(ids: readonly string[]) {
  try {
    const serialized = serializeSelectedLocationIds(ids);
    if (serialized) globalThis.localStorage?.setItem(STORAGE_KEY, serialized);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface LocationState {
  selectedLocationIds: string[];
  /** Cached lookup for single-location display and notification deep-links. */
  locationById: Record<string, LocationListItem>;
  /** Count of locations in the navbar list (set when list is fetched). */
  availableLocationCount: number;
  /** True after Navbar finishes the initial locations list fetch (or gives up). */
  listHydrated: boolean;
}

const initialState: LocationState = {
  selectedLocationIds: [],
  locationById: {},
  availableLocationCount: 0,
  listHydrated: false,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setLocationCatalog: (
      state,
      action: PayloadAction<{ locations: LocationListItem[]; storedId?: string | null }>,
    ) => {
      const { locations } = action.payload;
      const availableIds = locations.map((l) => l._id);
      state.availableLocationCount = availableIds.length;
      state.locationById = Object.fromEntries(locations.map((l) => [l._id, l]));
      const stored = action.payload.storedId ?? getStoredLocationId();
      state.selectedLocationIds = parseStoredLocationSelection(stored, availableIds);
      setStoredLocationId(state.selectedLocationIds);
    },
    /** Refresh catalog (e.g. dropdown open) without re-reading localStorage or resetting valid selection. */
    syncLocationCatalog: (state, action: PayloadAction<{ locations: LocationListItem[] }>) => {
      const { locations } = action.payload;
      const availableIds = locations.map((l) => l._id);
      state.availableLocationCount = availableIds.length;
      state.locationById = Object.fromEntries(locations.map((l) => [l._id, l]));
      const normalized = normalizeSelection(state.selectedLocationIds, availableIds);
      const selectionChanged =
        normalized.length !== state.selectedLocationIds.length ||
        normalized.some((id, i) => id !== state.selectedLocationIds[i]);
      if (selectionChanged) {
        state.selectedLocationIds = normalized;
        setStoredLocationId(state.selectedLocationIds);
      }
    },
    setSelectedLocationIds: (state, action: PayloadAction<string[]>) => {
      const availableIds = Object.keys(state.locationById);
      const normalized = normalizeSelection(action.payload, availableIds);
      const selectionChanged =
        normalized.length !== state.selectedLocationIds.length ||
        normalized.some((id, i) => id !== state.selectedLocationIds[i]);
      if (!selectionChanged) return;
      state.selectedLocationIds = normalized;
      setStoredLocationId(state.selectedLocationIds);
    },
    toggleLocationId: (
      state,
      action: PayloadAction<{ id: string; allAvailableIds: string[] }>,
    ) => {
      const { id, allAvailableIds } = action.payload;
      const current = new Set(state.selectedLocationIds);
      if (current.has(id)) {
        if (current.size <= 1) return;
        current.delete(id);
      } else {
        current.add(id);
      }
      state.selectedLocationIds = normalizeSelection([...current], allAvailableIds);
      state.availableLocationCount = allAvailableIds.length;
      setStoredLocationId(state.selectedLocationIds);
    },
    selectAllLocationIds: (state, action: PayloadAction<string[]>) => {
      state.selectedLocationIds = normalizeSelection(action.payload, action.payload);
      state.availableLocationCount = action.payload.length;
      setStoredLocationId(state.selectedLocationIds);
    },
    clearToSingleLocation: (state, action: PayloadAction<LocationListItem>) => {
      state.locationById[action.payload._id] = action.payload;
      state.selectedLocationIds = [action.payload._id];
      setStoredLocationId(state.selectedLocationIds);
    },
    /** @deprecated Use setSelectedLocationIds — maps to single id */
    setCurrentLocation: (state, action: PayloadAction<LocationListItem | null>) => {
      if (!action.payload) {
        state.selectedLocationIds = [];
        setStoredLocationId([]);
        return;
      }
      state.locationById[action.payload._id] = action.payload;
      state.selectedLocationIds = [action.payload._id];
      setStoredLocationId(state.selectedLocationIds);
    },
    /** @deprecated Use selectAllLocationIds */
    setAllLocationsSelected: (state) => {
      const allIds = Object.keys(state.locationById);
      state.selectedLocationIds = normalizeSelection(allIds, allIds);
      setStoredLocationId(state.selectedLocationIds);
    },
    setLocationListHydrated: (state, action: PayloadAction<boolean>) => {
      state.listHydrated = action.payload;
    },
    resetLocationState: () => {
      setStoredLocationId([]);
      return initialState;
    },
  },
});

export const {
  setLocationCatalog,
  syncLocationCatalog,
  setSelectedLocationIds,
  toggleLocationId,
  selectAllLocationIds,
  clearToSingleLocation,
  setCurrentLocation,
  setAllLocationsSelected,
  setLocationListHydrated,
  resetLocationState,
} = locationSlice.actions;
export { getStoredLocationId };
export default locationSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LocationListItem } from '../../types';
import { normalizeSelectionScopes, selectedIdsFromScopes, type LocationSelectionScopes } from '../../utils/locationScopedSelection';
import {
  normalizeSelection,
  parseStoredLocationSelection,
  serializeSelectedLocationIds,
  ALL_LOCATIONS_ID,
} from '../../utils/locationSelectionHelpers';

const STORAGE_KEY = 'tikka_current_location_id';
const SCOPES_STORAGE_KEY = 'tikka_location_selection_scopes';

export { ALL_LOCATIONS_ID };

function getStoredLocationId(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getStoredScopes(ids: readonly string[]): LocationSelectionScopes | null {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(SCOPES_STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!Object.values(raw).every(value => Array.isArray(value) && value.every(id => typeof id === 'string'))) return null;
    const scopes = normalizeSelectionScopes(raw as LocationSelectionScopes, ids);
    const scopedIds = selectedIdsFromScopes(scopes);
    return ids.length === scopedIds.length && ids.every(id => scopedIds.includes(id)) ? scopes : null;
  } catch { return null; }
}

function setStoredLocationId(ids: readonly string[], scopes: LocationSelectionScopes | null = null) {
  try {
    // An empty selection serializes to EMPTY_SELECTION_MARKER rather than '', so
    // the key is always written and a cleared selection survives a reload.
    globalThis.localStorage?.setItem(STORAGE_KEY, serializeSelectedLocationIds(ids));
    if (scopes) globalThis.localStorage?.setItem(SCOPES_STORAGE_KEY, JSON.stringify(scopes));
    else globalThis.localStorage?.removeItem(SCOPES_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface LocationState {
  selectedLocationIds: string[];
  selectedLocationScopes: LocationSelectionScopes | null;
  /** Cached lookup for single-location display and notification deep-links. */
  locationById: Record<string, LocationListItem>;
  /** Count of locations in the navbar list (set when list is fetched). */
  availableLocationCount: number;
  /** True after Navbar finishes the initial locations list fetch (or gives up). */
  listHydrated: boolean;
}

const initialState: LocationState = {
  selectedLocationIds: [],
  selectedLocationScopes: null,
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
      state.selectedLocationScopes = getStoredScopes(state.selectedLocationIds);
      setStoredLocationId(state.selectedLocationIds, state.selectedLocationScopes);
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
        if (state.selectedLocationScopes) state.selectedLocationScopes = normalizeSelectionScopes(state.selectedLocationScopes, normalized);
        setStoredLocationId(state.selectedLocationIds, state.selectedLocationScopes);
      }
    },
    setScopedLocationSelection: (state, action: PayloadAction<LocationSelectionScopes>) => {
      state.selectedLocationScopes = normalizeSelectionScopes(action.payload, Object.keys(state.locationById));
      state.selectedLocationIds = selectedIdsFromScopes(state.selectedLocationScopes);
      setStoredLocationId(state.selectedLocationIds, state.selectedLocationScopes);
    },
    setSelectedLocationIds: (state, action: PayloadAction<string[]>) => {
      const availableIds = Object.keys(state.locationById);
      const normalized = normalizeSelection(action.payload, availableIds);
      const selectionChanged =
        normalized.length !== state.selectedLocationIds.length ||
        normalized.some((id, i) => id !== state.selectedLocationIds[i]);
      if (!selectionChanged) return;
      state.selectedLocationIds = normalized;
      state.selectedLocationScopes = null;
      setStoredLocationId(state.selectedLocationIds);
    },
    toggleLocationId: (
      state,
      action: PayloadAction<{ id: string; allAvailableIds: string[] }>,
    ) => {
      const { id, allAvailableIds } = action.payload;
      const current = new Set(state.selectedLocationIds);
      // Unchecking the last location is allowed: it leaves an empty selection,
      // which pages render as a "select a location" prompt.
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      state.selectedLocationIds = normalizeSelection([...current], allAvailableIds);
      state.selectedLocationScopes = null;
      state.availableLocationCount = allAvailableIds.length;
      setStoredLocationId(state.selectedLocationIds);
    },
    selectAllLocationIds: (state, action: PayloadAction<string[]>) => {
      state.selectedLocationIds = normalizeSelection(action.payload, action.payload);
      state.selectedLocationScopes = null;
      state.availableLocationCount = action.payload.length;
      setStoredLocationId(state.selectedLocationIds);
    },
    clearToSingleLocation: (state, action: PayloadAction<LocationListItem>) => {
      state.locationById[action.payload._id] = action.payload;
      state.selectedLocationIds = [action.payload._id];
      state.selectedLocationScopes = null;
      setStoredLocationId(state.selectedLocationIds);
    },
    /** @deprecated Use setSelectedLocationIds — maps to single id */
    setCurrentLocation: (state, action: PayloadAction<LocationListItem | null>) => {
      state.selectedLocationScopes = null;
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
      state.selectedLocationScopes = null;
      setStoredLocationId(state.selectedLocationIds);
    },
    setLocationListHydrated: (state, action: PayloadAction<boolean>) => {
      state.listHydrated = action.payload;
    },
    resetLocationState: () => {
      // Clear the key outright (logout): unlike a user-cleared selection, this
      // should fall back to the first-location default on the next load.
      try {
        globalThis.localStorage?.removeItem(STORAGE_KEY);
        globalThis.localStorage?.removeItem(SCOPES_STORAGE_KEY);
      } catch {
        // ignore
      }
      return initialState;
    },
  },
});

export const {
  setLocationCatalog,
  syncLocationCatalog,
  setSelectedLocationIds,
  setScopedLocationSelection,
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

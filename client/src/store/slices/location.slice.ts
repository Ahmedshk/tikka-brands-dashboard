import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LocationListItem } from '../../types';

const STORAGE_KEY = 'tikka_current_location_id';

export const ALL_LOCATIONS_ID = '__all__';

function getStoredLocationId(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredLocationId(id: string | null) {
  try {
    if (id) globalThis.localStorage?.setItem(STORAGE_KEY, id);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface LocationState {
  currentLocation: LocationListItem | null;
  /** Whether the user selected the pseudo-location "All". */
  allLocationsSelected: boolean;
  /** True after Navbar finishes the initial locations list fetch (or gives up). Pages should wait before calling location-scoped APIs to avoid a duplicate request without locationId. */
  listHydrated: boolean;
}

const initialState: LocationState = {
  currentLocation: null,
  allLocationsSelected: false,
  listHydrated: false,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setCurrentLocation: (state, action: PayloadAction<LocationListItem | null>) => {
      state.currentLocation = action.payload;
      state.allLocationsSelected = false;
      setStoredLocationId(action.payload?._id ?? null);
    },
    setAllLocationsSelected: (state) => {
      state.currentLocation = null;
      state.allLocationsSelected = true;
      setStoredLocationId(ALL_LOCATIONS_ID);
    },
    setLocationListHydrated: (state, action: PayloadAction<boolean>) => {
      state.listHydrated = action.payload;
    },
  },
});

export const { setCurrentLocation, setAllLocationsSelected, setLocationListHydrated } =
  locationSlice.actions;
export { getStoredLocationId };
export default locationSlice.reducer;

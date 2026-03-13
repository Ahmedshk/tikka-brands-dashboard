import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LocationListItem } from '../../types';

const STORAGE_KEY = 'tikka_current_location_id';

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
}

const initialState: LocationState = {
  currentLocation: null,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setCurrentLocation: (state, action: PayloadAction<LocationListItem | null>) => {
      state.currentLocation = action.payload;
      setStoredLocationId(action.payload?._id ?? null);
    },
  },
});

export const { setCurrentLocation } = locationSlice.actions;
export { getStoredLocationId };
export default locationSlice.reducer;

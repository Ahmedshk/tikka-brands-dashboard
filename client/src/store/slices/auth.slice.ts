import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "../../types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once initial session check (refresh) has completed */
  authCheckDone: boolean;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  authCheckDone: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.isLoading = false;
    },
    clearUser: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isLoading = false;
    },
    setAuthCheckDone: (state, action: PayloadAction<boolean>) => {
      state.authCheckDone = action.payload;
    },
    updateUserContext: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user != null && action.payload != null) {
        Object.assign(state.user, action.payload);
      }
    },
  },
});

export const { setLoading, setUser, clearUser, setAuthCheckDone, updateUserContext } =
  authSlice.actions;
export default authSlice.reducer;

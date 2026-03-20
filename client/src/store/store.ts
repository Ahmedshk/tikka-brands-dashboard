import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/auth.slice';
import userReducer from './slices/user.slice';
import locationReducer from './slices/location.slice';
import notificationReducer from './slices/notification.slice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    location: locationReducer,
    notification: notificationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

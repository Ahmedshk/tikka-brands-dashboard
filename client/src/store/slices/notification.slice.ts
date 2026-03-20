import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { NotificationItem } from "../../services/notification.service";

interface NotificationState {
  unreadCount: number;
  notifications: NotificationItem[];
  isLoaded: boolean;
}

const initialState: NotificationState = {
  unreadCount: 0,
  notifications: [],
  isLoaded: false,
};

const notificationSlice = createSlice({
  name: "notification",
  initialState,
  reducers: {
    setUnreadCount(state, action: PayloadAction<number>) {
      state.unreadCount = action.payload;
    },
    incrementUnreadCount(state) {
      state.unreadCount += 1;
    },
    setNotifications(state, action: PayloadAction<NotificationItem[]>) {
      state.notifications = action.payload;
      state.isLoaded = true;
    },
    addNotification(state, action: PayloadAction<NotificationItem>) {
      state.notifications.unshift(action.payload);
    },
    markNotificationRead(state, action: PayloadAction<string>) {
      const item = state.notifications.find((n) => n._id === action.payload);
      if (item && !item.isRead) {
        item.isRead = true;
        item.readAt = new Date().toISOString();
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllNotificationsRead(state) {
      for (const n of state.notifications) {
        if (!n.isRead) {
          n.isRead = true;
          n.readAt = new Date().toISOString();
        }
      }
      state.unreadCount = 0;
    },
    clearNotifications() {
      return initialState;
    },
  },
});

export const {
  setUnreadCount,
  incrementUnreadCount,
  setNotifications,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
} = notificationSlice.actions;

export default notificationSlice.reducer;

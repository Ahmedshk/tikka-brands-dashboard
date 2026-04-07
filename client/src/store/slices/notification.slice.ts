import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { NotificationItem } from "../../services/notification.service";

export type NotificationListPagePayload = {
  notifications: NotificationItem[];
  page: number;
  totalPages: number;
};

interface NotificationState {
  unreadCount: number;
  notifications: NotificationItem[];
  /** True after the first successful list fetch this session (cleared on logout / full refresh). */
  isLoaded: boolean;
  /** Last page number fetched from the API (1-based). */
  listPage: number;
  /** Whether more pages exist beyond `listPage`. */
  listHasMore: boolean;
}

const initialState: NotificationState = {
  unreadCount: 0,
  notifications: [],
  isLoaded: false,
  listPage: 0,
  listHasMore: false,
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
    setNotifications(state, action: PayloadAction<NotificationListPagePayload>) {
      const { notifications, page, totalPages } = action.payload;
      state.notifications = notifications;
      state.listPage = page;
      state.listHasMore = page < totalPages;
      state.isLoaded = true;
    },
    appendNotifications(state, action: PayloadAction<NotificationListPagePayload>) {
      const { notifications, page, totalPages } = action.payload;
      const existing = new Set(state.notifications.map((n) => n._id));
      for (const n of notifications) {
        if (!existing.has(n._id)) {
          state.notifications.push(n);
          existing.add(n._id);
        }
      }
      state.listPage = page;
      state.listHasMore = page < totalPages;
    },
    addNotification(state, action: PayloadAction<NotificationItem>) {
      if (state.notifications.some((n) => n._id === action.payload._id)) return;
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
      return { ...initialState };
    },
  },
});

export const {
  setUnreadCount,
  incrementUnreadCount,
  setNotifications,
  appendNotifications,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
} = notificationSlice.actions;

export default notificationSlice.reducer;

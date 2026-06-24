import api from "./api.service";
import { isAxiosError } from "axios";

export interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /** Set by GET /notifications when `data.locationId` resolves to a location (not stored in DB). */
  locationLabel?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

interface NotificationListResponse {
  notifications: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const notificationService = {
  async getNotifications(params?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<NotificationListResponse> {
    const { data } = await api.get("/notifications", { params });
    return data.data;
  },

  async getUnreadCount(config?: { signal?: AbortSignal }): Promise<number> {
    const { data } = await api.get("/notifications/unread-count", {
      signal: config?.signal,
    });
    return data.data.count;
  },

  async markAsRead(id: string): Promise<void> {
    try {
      await api.patch(`/notifications/${id}/read`, undefined, {
        skipGlobalErrorToast: true,
      });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return;
      }
      throw error;
    }
  },

  async markAllAsRead(): Promise<void> {
    await api.patch("/notifications/read-all");
  },
};

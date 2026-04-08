import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import type { AlertNotificationSettingsDto } from "../types/alertNotification.types";

export const alertNotificationSettingsService = {
  async get(): Promise<AlertNotificationSettingsDto> {
    const { data } = await api.get(`${API_ENDPOINTS.ALERT_NOTIFICATION_SETTINGS}`);
    return (data as { data: { settings: AlertNotificationSettingsDto } }).data.settings;
  },

  async update(
    body: Partial<AlertNotificationSettingsDto>,
  ): Promise<AlertNotificationSettingsDto> {
    const { data } = await api.put(API_ENDPOINTS.ALERT_NOTIFICATION_SETTINGS, body);
    return (data as { data: { settings: AlertNotificationSettingsDto } }).data.settings;
  },
};

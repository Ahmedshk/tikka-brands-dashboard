import api from "./api.service";
import type { LocationApiParams } from "../utils/locationSelectionHelpers";
import { resolveLocationQuery } from "../utils/locationSelectionHelpers";
import { API_ENDPOINTS } from "../utils/constants";
import type { ApiResponse } from "../types";
import type {
  CalendarEventDto,
  CalendarEventTypeDto,
  CalendarNotificationSettingsDto,
  CalendarRoleEventBindingDto,
  CalendarReminderPolicyDto,
  IntegratedGoogleCalendarDto,
} from "../types/calendar.types";

function toIso(d: Date): string {
  return d.toISOString();
}

export const calendarService = {
  async listEvents(
    locationQuery: LocationApiParams | string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<CalendarEventDto[]> {
    const params = new URLSearchParams({
      ...resolveLocationQuery(locationQuery),
      timeMin: toIso(timeMin),
      timeMax: toIso(timeMax),
    });
    const res = await api.get<ApiResponse<{ events: CalendarEventDto[] }>>(
      `${API_ENDPOINTS.CALENDAR.EVENTS}?${params.toString()}`,
    );
    if (!res.data.success || !res.data.data?.events) {
      throw new Error(res.data.message ?? "Failed to load calendar events.");
    }
    return res.data.data.events;
  },

  async syncEvents(timeMin: Date, timeMax: Date): Promise<{ upserted: number }> {
    const res = await api.post<ApiResponse<{ upserted: number }>>(
      `${API_ENDPOINTS.CALENDAR.EVENTS}/sync`,
      { timeMin: toIso(timeMin), timeMax: toIso(timeMax) },
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to sync calendar.");
    }
    return res.data.data;
  },

  async createEvent(payload: {
    title: string;
    description?: string;
    start: Date;
    end: Date;
    eventTypeId: string;
    locationId: string;
    googleCalendarId: string;
  }): Promise<CalendarEventDto> {
    const res = await api.post<ApiResponse<{ event: CalendarEventDto }>>(
      API_ENDPOINTS.CALENDAR.EVENTS,
      {
        title: payload.title,
        ...(payload.description ? { description: payload.description } : {}),
        start: toIso(payload.start),
        end: toIso(payload.end),
        eventTypeId: payload.eventTypeId,
        locationId: payload.locationId,
        googleCalendarId: payload.googleCalendarId,
      },
    );
    if (!res.data.success || !res.data.data?.event) {
      throw new Error(res.data.message ?? "Failed to create event.");
    }
    return res.data.data.event;
  },

  async updateEvent(
    id: string,
    payload: Partial<{
      title: string;
      description: string;
      start: Date;
      end: Date;
      eventTypeId: string;
    }>,
  ): Promise<CalendarEventDto> {
    const body: Record<string, unknown> = {};
    if (payload.title !== undefined) body.title = payload.title;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.start !== undefined) body.start = toIso(payload.start);
    if (payload.end !== undefined) body.end = toIso(payload.end);
    if (payload.eventTypeId !== undefined) body.eventTypeId = payload.eventTypeId;
    const res = await api.patch<ApiResponse<{ event: CalendarEventDto }>>(
      `${API_ENDPOINTS.CALENDAR.EVENTS}/${id}`,
      body,
    );
    if (!res.data.success || !res.data.data?.event) {
      throw new Error(res.data.message ?? "Failed to update event.");
    }
    return res.data.data.event;
  },

  async deleteEvent(id: string): Promise<void> {
    const res = await api.delete<ApiResponse<unknown>>(`${API_ENDPOINTS.CALENDAR.EVENTS}/${id}`);
    if (!res.data.success) {
      throw new Error(res.data.message ?? "Failed to delete event.");
    }
  },

  async listEventTypesActive(): Promise<CalendarEventTypeDto[]> {
    const res = await api.get<ApiResponse<{ eventTypes: CalendarEventTypeDto[] }>>(
      API_ENDPOINTS.CALENDAR.EVENT_TYPES,
    );
    if (!res.data.success || !res.data.data?.eventTypes) {
      throw new Error(res.data.message ?? "Failed to load event types.");
    }
    return res.data.data.eventTypes;
  },

  async listEventTypesAll(): Promise<CalendarEventTypeDto[]> {
    const res = await api.get<ApiResponse<{ eventTypes: CalendarEventTypeDto[] }>>(
      API_ENDPOINTS.CALENDAR.EVENT_TYPES_ALL,
    );
    if (!res.data.success || !res.data.data?.eventTypes) {
      throw new Error(res.data.message ?? "Failed to load event types.");
    }
    return res.data.data.eventTypes;
  },

  async createEventType(body: {
    name: string;
    colorHex?: string;
    sortOrder?: number;
    isActive?: boolean;
    reminderPolicy?: CalendarReminderPolicyDto;
  }): Promise<CalendarEventTypeDto> {
    const res = await api.post<ApiResponse<{ eventType: CalendarEventTypeDto }>>(
      API_ENDPOINTS.CALENDAR.EVENT_TYPES,
      body,
    );
    if (!res.data.success || !res.data.data?.eventType) {
      throw new Error(res.data.message ?? "Failed to create event type.");
    }
    return res.data.data.eventType;
  },

  async updateEventType(
    id: string,
    body: Partial<{
      name: string;
      colorHex: string;
      sortOrder: number;
      isActive: boolean;
      reminderPolicy: Partial<CalendarReminderPolicyDto>;
    }>,
  ): Promise<CalendarEventTypeDto> {
    const res = await api.patch<ApiResponse<{ eventType: CalendarEventTypeDto }>>(
      `${API_ENDPOINTS.CALENDAR.EVENT_TYPES}/${id}`,
      body,
    );
    if (!res.data.success || !res.data.data?.eventType) {
      throw new Error(res.data.message ?? "Failed to update event type.");
    }
    return res.data.data.eventType;
  },

  async deleteEventType(id: string): Promise<void> {
    const res = await api.delete<ApiResponse<unknown>>(
      `${API_ENDPOINTS.CALENDAR.EVENT_TYPES}/${id}`,
    );
    if (!res.data.success) {
      throw new Error(res.data.message ?? "Failed to delete event type.");
    }
  },

  async getNotificationSettings(): Promise<CalendarNotificationSettingsDto> {
    const res = await api.get<ApiResponse<{ settings: CalendarNotificationSettingsDto }>>(
      API_ENDPOINTS.CALENDAR.NOTIFICATION_SETTINGS,
    );
    if (!res.data.success || !res.data.data?.settings) {
      throw new Error(res.data.message ?? "Failed to load notification settings.");
    }
    return res.data.data.settings;
  },

  async updateNotificationSettings(body: {
    reminderPolicy?: CalendarReminderPolicyDto;
    roleEventBindings?: CalendarRoleEventBindingDto[];
  }): Promise<CalendarNotificationSettingsDto> {
    const res = await api.put<ApiResponse<{ settings: CalendarNotificationSettingsDto }>>(
      API_ENDPOINTS.CALENDAR.NOTIFICATION_SETTINGS,
      body,
    );
    if (!res.data.success || !res.data.data?.settings) {
      throw new Error(res.data.message ?? "Failed to save notification settings.");
    }
    return res.data.data.settings;
  },

  async listGoogleCalendarIntegrations(): Promise<IntegratedGoogleCalendarDto[]> {
    const res = await api.get<ApiResponse<{ integrations: IntegratedGoogleCalendarDto[] }>>(
      API_ENDPOINTS.CALENDAR.INTEGRATIONS_GOOGLE_CALENDARS,
    );
    if (!res.data.success || !res.data.data?.integrations) {
      throw new Error(res.data.message ?? "Failed to load Google calendars.");
    }
    return res.data.data.integrations;
  },

  async getGoogleCalendarIntegrationsInfo(): Promise<{
    serviceAccountEmail: string | null;
    impersonatedUser: string | null;
  }> {
    const res = await api.get<
      ApiResponse<{ serviceAccountEmail: string | null; impersonatedUser: string | null }>
    >(API_ENDPOINTS.CALENDAR.INTEGRATIONS_GOOGLE_CALENDARS_INFO);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message ?? "Failed to load Google Calendar integration info.");
    }
    return {
      serviceAccountEmail: res.data.data.serviceAccountEmail ?? null,
      impersonatedUser: res.data.data.impersonatedUser ?? null,
    };
  },

  async createGoogleCalendarIntegration(body: {
    name: string;
    googleCalendarId: string;
    description?: string;
  }): Promise<IntegratedGoogleCalendarDto> {
    const res = await api.post<ApiResponse<{ integration: IntegratedGoogleCalendarDto }>>(
      API_ENDPOINTS.CALENDAR.INTEGRATIONS_GOOGLE_CALENDARS,
      body,
    );
    if (!res.data.success || !res.data.data?.integration) {
      throw new Error(res.data.message ?? "Failed to add Google calendar.");
    }
    return res.data.data.integration;
  },

  async deleteGoogleCalendarIntegration(id: string): Promise<{ deletedEventCount: number }> {
    const res = await api.delete<
      ApiResponse<{ deletedEventCount: number }> & { message?: string }
    >(`${API_ENDPOINTS.CALENDAR.INTEGRATIONS_GOOGLE_CALENDARS}/${id}`);
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to remove Google calendar.");
    }
    return { deletedEventCount: res.data.data.deletedEventCount ?? 0 };
  },

  async updateGoogleCalendarIntegration(
    id: string,
    body: { name: string; description?: string },
  ): Promise<IntegratedGoogleCalendarDto> {
    const res = await api.patch<ApiResponse<{ integration: IntegratedGoogleCalendarDto }>>(
      `${API_ENDPOINTS.CALENDAR.INTEGRATIONS_GOOGLE_CALENDARS}/${id}`,
      body,
    );
    if (!res.data.success || !res.data.data?.integration) {
      throw new Error(res.data.message ?? "Failed to update Google calendar.");
    }
    return res.data.data.integration;
  },
};

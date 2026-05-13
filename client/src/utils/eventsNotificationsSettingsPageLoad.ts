import api from "../services/api.service";
import { API_ENDPOINTS } from "./constants";
import { calendarService } from "../services/calendar.service";
import type {
  CalendarEventTypeDto,
  CalendarNotificationSettingsDto,
  IntegratedGoogleCalendarDto,
} from "../types/calendar.types";

export type RoleOption = { _id: string; name: string };

function parseRolesResponse(data: unknown): RoleOption[] {
  const body = data as { data?: { roles?: RoleOption[] } } | null | undefined;
  const roles = body?.data?.roles;
  return Array.isArray(roles) ? roles : [];
}

export async function loadEventsNotificationsSettings(): Promise<{
  eventTypes: CalendarEventTypeDto[];
  roles: RoleOption[];
  settings: CalendarNotificationSettingsDto;
  integrations: IntegratedGoogleCalendarDto[];
}> {
  const [eventTypes, rolesRes, settings, integrations] = await Promise.all([
    calendarService.listEventTypesAll(),
    api.get(API_ENDPOINTS.ROLES),
    calendarService.getNotificationSettings(),
    calendarService.listGoogleCalendarIntegrations().catch(() => [] as IntegratedGoogleCalendarDto[]),
  ]);

  return {
    eventTypes,
    roles: parseRolesResponse(rolesRes.data),
    settings,
    integrations,
  };
}


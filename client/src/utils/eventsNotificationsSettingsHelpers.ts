import type { CalendarEventTypeDto } from "../types/calendar.types";

export function getRoleNamesForEventType(params: {
  eventTypeId: string;
  bindings: Array<{ eventTypeId: string; roleId: string }>;
  roles: Array<{ _id: string; name: string }>;
}) {
  const { eventTypeId, bindings, roles } = params;
  const roleIdToName = new Map(roles.map((r) => [r._id, r.name] as const));
  return bindings
    .filter((b) => b.eventTypeId === eventTypeId)
    .map((b) => roleIdToName.get(b.roleId) ?? "Role")
    .join(", ");
}

export function getFirstEventTypeId(eventTypes: CalendarEventTypeDto[]): string {
  return eventTypes[0]?._id ?? "";
}


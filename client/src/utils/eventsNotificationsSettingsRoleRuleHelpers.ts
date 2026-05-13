import type { CalendarRoleEventBindingDto } from "../types/calendar.types";

const DEFAULT_CHANNELS = { inApp: true, email: false, sms: false };

export type UiBindingLike = CalendarRoleEventBindingDto & { key?: string };

export function getRoleRuleModalState(params: {
  eventTypeId: string;
  bindings: UiBindingLike[];
}): {
  selectedRoleIds: Set<string>;
  channels: { inApp: boolean; email: boolean; sms: boolean };
} {
  const { eventTypeId, bindings } = params;
  const typeBindings = bindings.filter((b) => b.eventTypeId === eventTypeId);
  const selectedRoleIds = new Set(typeBindings.map((b) => b.roleId));
  const first = typeBindings[0];
  const channels = first ? { ...DEFAULT_CHANNELS, ...first.channels } : DEFAULT_CHANNELS;
  return { selectedRoleIds, channels };
}


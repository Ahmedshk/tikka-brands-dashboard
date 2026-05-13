import toast from "react-hot-toast";
import { calendarService } from "../services/calendar.service";
import type {
  CalendarEventTypeDto,
  CalendarNotificationSettingsDto,
  CalendarRoleEventBindingDto,
  IntegratedGoogleCalendarDto,
} from "../types/calendar.types";

type SetState<T> = (value: T | ((prev: T) => T)) => void;
type UiBindingLike = CalendarRoleEventBindingDto & { key?: string };

export async function saveNotificationSettings(params: {
  bindings: UiBindingLike[];
  setSaving: (saving: boolean) => void;
  applySettings: (settings: CalendarNotificationSettingsDto) => void;
}) {
  const { bindings, setSaving, applySettings } = params;
  setSaving(true);
  try {
    const payloadRows = bindings.map(({ key: _k, ...rest }) => rest);
    const pairSeen = new Set<string>();
    const roleEventBindings = payloadRows.filter((row) => {
      const pair = `${String(row.eventTypeId)}\0${String(row.roleId)}`;
      if (pairSeen.has(pair)) return false;
      pairSeen.add(pair);
      return true;
    });
    const saved = await calendarService.updateNotificationSettings({ roleEventBindings });
    applySettings(saved);
    toast.success("Notification settings saved.");
  } catch {
    toast.error("Failed to save notification settings.");
  } finally {
    setSaving(false);
  }
}

export async function createEventType(params: {
  newTypeName: string;
  newTypeColor: string;
  newTypeActive: boolean;
  newTypeReminderMode: "daily_until" | "single";
  daysBeforeStart: number;
  reminderTimeLocal: string;
  setEventTypes: SetState<CalendarEventTypeDto[]>;
  resetNewTypeFields: () => void;
  closeModal: () => void;
}) {
  const {
    newTypeName,
    newTypeColor,
    newTypeActive,
    newTypeReminderMode,
    daysBeforeStart,
    reminderTimeLocal,
    setEventTypes,
    resetNewTypeFields,
    closeModal,
  } = params;

  if (!newTypeName.trim()) {
    toast.error("Name is required.");
    return;
  }

  try {
    const created = await calendarService.createEventType({
      name: newTypeName.trim(),
      colorHex: newTypeColor,
      isActive: newTypeActive,
      reminderPolicy: {
        mode: newTypeReminderMode,
        daysBeforeStart,
        reminderTimeLocal: reminderTimeLocal.length === 5 ? reminderTimeLocal : "09:00",
      },
    });
    setEventTypes((prev) =>
      [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    );
    resetNewTypeFields();
    closeModal();
    toast.success("Event type created.");
  } catch {
    toast.error("Failed to create event type.");
  }
}

export async function saveEditedEventType(params: {
  editingType: CalendarEventTypeDto | null;
  editTypeName: string;
  editTypeColor: string;
  editTypeActive: boolean;
  editTypeReminderMode: "daily_until" | "single";
  daysBeforeStart: number;
  reminderTimeLocal: string;
  setEditTypeSaving: (saving: boolean) => void;
  setEventTypes: SetState<CalendarEventTypeDto[]>;
  closeEditTypeModal: () => void;
}) {
  const {
    editingType,
    editTypeName,
    editTypeColor,
    editTypeActive,
    editTypeReminderMode,
    daysBeforeStart,
    reminderTimeLocal,
    setEditTypeSaving,
    setEventTypes,
    closeEditTypeModal,
  } = params;

  if (!editingType) return;
  if (!editTypeName.trim()) {
    toast.error("Name is required.");
    return;
  }

  setEditTypeSaving(true);
  try {
    const updated = await calendarService.updateEventType(editingType._id, {
      name: editTypeName.trim(),
      colorHex: editTypeColor,
      isActive: editTypeActive,
      reminderPolicy: {
        mode: editTypeReminderMode,
        daysBeforeStart,
        reminderTimeLocal: reminderTimeLocal.length === 5 ? reminderTimeLocal : "09:00",
      },
    });
    setEventTypes((prev) =>
      prev
        .map((x) => (x._id === updated._id ? updated : x))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    );
    closeEditTypeModal();
    toast.success("Event type updated.");
  } catch {
    toast.error("Failed to update event type.");
  } finally {
    setEditTypeSaving(false);
  }
}

export async function deleteEventType(params: {
  eventTypePendingDelete: CalendarEventTypeDto | null;
  setDeletingEventType: (v: boolean) => void;
  setEventTypes: SetState<CalendarEventTypeDto[]>;
  setBindings: SetState<UiBindingLike[]>;
  setEventTypePendingDelete: (t: CalendarEventTypeDto | null) => void;
}) {
  const { eventTypePendingDelete, setDeletingEventType, setEventTypes, setBindings, setEventTypePendingDelete } =
    params;

  const t = eventTypePendingDelete;
  if (!t) return;
  setDeletingEventType(true);
  try {
    await calendarService.deleteEventType(t._id);
    setEventTypes((prev) => prev.filter((x) => x._id !== t._id));
    setBindings((prev) => prev.filter((b) => b.eventTypeId !== t._id));
    toast.success("Event type deleted.");
    setEventTypePendingDelete(null);
  } catch {
    toast.error("Failed to delete event type.");
  } finally {
    setDeletingEventType(false);
  }
}

export async function upsertGoogleCalendarIntegration(params: {
  editingIntegration: IntegratedGoogleCalendarDto | null;
  newCalName: string;
  newCalGoogleId: string;
  newCalDescription: string;
  setSavingCalIntegration: (v: boolean) => void;
  setGoogleCalIntegrations: SetState<IntegratedGoogleCalendarDto[]>;
  closeModal: () => void;
  clearEditing: () => void;
  isIdEditable: boolean;
}) {
  const {
    editingIntegration,
    newCalName,
    newCalGoogleId,
    newCalDescription,
    setSavingCalIntegration,
    setGoogleCalIntegrations,
    closeModal,
    clearEditing,
    isIdEditable,
  } = params;

  if (!newCalName.trim()) {
    toast.error("Calendar name is required.");
    return;
  }
  if (isIdEditable && !newCalGoogleId.trim()) {
    toast.error("Google Calendar ID is required.");
    return;
  }

  setSavingCalIntegration(true);
  try {
    if (editingIntegration) {
      const updated = await calendarService.updateGoogleCalendarIntegration(editingIntegration._id, {
        name: newCalName.trim(),
        ...(newCalDescription.trim() ? { description: newCalDescription.trim() } : { description: "" }),
      });
      setGoogleCalIntegrations((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
      closeModal();
      clearEditing();
      toast.success("Google Calendar updated.");
    } else {
      const created = await calendarService.createGoogleCalendarIntegration({
        name: newCalName.trim(),
        googleCalendarId: newCalGoogleId.trim(),
        ...(newCalDescription.trim() ? { description: newCalDescription.trim() } : {}),
      });
      setGoogleCalIntegrations((prev) => [...prev, created].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      closeModal();
      toast.success("Google Calendar integrated.");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add calendar.";
    toast.error(msg);
  } finally {
    setSavingCalIntegration(false);
  }
}

export async function deleteGoogleCalendarIntegration(params: {
  integrationPendingDelete: IntegratedGoogleCalendarDto | null;
  setDeletingIntegration: (v: boolean) => void;
  setGoogleCalIntegrations: SetState<IntegratedGoogleCalendarDto[]>;
  setIntegrationPendingDelete: (row: IntegratedGoogleCalendarDto | null) => void;
}) {
  const { integrationPendingDelete, setDeletingIntegration, setGoogleCalIntegrations, setIntegrationPendingDelete } =
    params;

  const row = integrationPendingDelete;
  if (!row) return;
  setDeletingIntegration(true);
  try {
    const { deletedEventCount } = await calendarService.deleteGoogleCalendarIntegration(row._id);
    setGoogleCalIntegrations((prev) => prev.filter((x) => x._id !== row._id));
    setIntegrationPendingDelete(null);
    toast.success(
      deletedEventCount > 0
        ? `Integration removed and ${deletedEventCount} dashboard event(s) deleted.`
        : "Integration removed.",
    );
  } catch {
    toast.error("Failed to remove integration.");
  } finally {
    setDeletingIntegration(false);
  }
}


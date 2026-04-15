import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { AnalogTimePickerField } from "../../components/common/AnalogTimePickerField";
import { Dropdown, type DropdownOption } from "../../components/common/Dropdown";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { ConfirmDialog } from "../../components/modal/ConfirmDialog";
import { calendarService } from "../../services/calendar.service";
import api from "../../services/api.service";
import { API_ENDPOINTS } from "../../utils/constants";
import { format } from "date-fns";
import {
  DEFAULT_CALENDAR_REMINDER_POLICY,
  type CalendarEventTypeDto,
  type CalendarNotificationSettingsDto,
  type CalendarRoleEventBindingDto,
  type IntegratedGoogleCalendarDto,
} from "../../types/calendar.types";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";
import EditIcon from "@assets/icons/edit.svg?react";
import DeleteIcon from "@assets/icons/delete.svg?react";
import { FiInfo, FiPlus } from "react-icons/fi";

const fieldInputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary";

const colorSwatchInputClass =
  "h-10 w-14 shrink-0 rounded-lg border border-gray-300 cursor-pointer bg-card-background p-1 focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary";

const eventTypesTableCardClass =
  "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

/** Desktop table header/body cell classes — aligned with EmployeeTrainingCard / training-management. */
const eventTypesThFirstColClass =
  "text-left font-semibold px-4 lg:px-6 py-3 lg:py-4 text-[10px] md:text-xs 2xl:text-sm text-white";
const eventTypesTdFirstColClass = "px-4 lg:px-6 py-3 lg:py-4";
const eventTypesThActionsClass =
  "font-semibold px-2 py-3 md:py-2 2xl:py-3 text-[10px] md:text-xs 2xl:text-sm text-white text-center";

function formatReminderSummary(p: CalendarEventTypeDto["reminderPolicy"]): string {
  const mode = p.mode === "daily_until" ? "Daily until start" : "Single day";
  return `${mode} · ${p.daysBeforeStart}d before · ${p.reminderTimeLocal}`;
}

/** Parse on save only; empty while typing stays allowed in state. */
function parseDaysBeforeSubmit(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(365, Math.max(0, n));
}

function sanitizeDaysBeforeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 3);
}

interface RoleOption {
  _id: string;
  name: string;
}

function randomKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type UiBinding = CalendarRoleEventBindingDto & { key: string };

const DEFAULT_CHANNELS = { inApp: true, email: false, sms: false } as const;

const eventTypeStatusDropdownOptions: DropdownOption[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const eventTypeReminderModeDropdownOptions: DropdownOption[] = [
  { value: "daily_until", label: "Daily until event" },
  { value: "single", label: "Single reminder N days before" },
];

function bindingsFromSettings(rows: CalendarRoleEventBindingDto[]): UiBinding[] {
  const seen = new Set<string>();
  const out: UiBinding[] = [];
  for (const r of rows ?? []) {
    const pair = `${r.eventTypeId}\0${r.roleId}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    out.push({
      ...r,
      key: randomKey(),
      channels: { ...DEFAULT_CHANNELS, ...r.channels },
      notifyOnStart: true,
      notifyReminders: true,
    });
  }
  return out;
}

export const EventsNotificationsSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventTypes, setEventTypes] = useState<CalendarEventTypeDto[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [bindings, setBindings] = useState<UiBinding[]>([]);

  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeColor, setNewTypeColor] = useState("#6B7280");
  const [newTypeActive, setNewTypeActive] = useState(true);
  const [newTypeReminderMode, setNewTypeReminderMode] = useState<"daily_until" | "single">("daily_until");
  const [newTypeDaysBeforeInput, setNewTypeDaysBeforeInput] = useState(
    String(DEFAULT_CALENDAR_REMINDER_POLICY.daysBeforeStart),
  );
  const [newTypeReminderTimeLocal, setNewTypeReminderTimeLocal] = useState(
    DEFAULT_CALENDAR_REMINDER_POLICY.reminderTimeLocal,
  );

  const [editingType, setEditingType] = useState<CalendarEventTypeDto | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [editTypeColor, setEditTypeColor] = useState("#6B7280");
  const [editTypeActive, setEditTypeActive] = useState(true);
  const [editTypeReminderMode, setEditTypeReminderMode] = useState<"daily_until" | "single">("daily_until");
  const [editTypeDaysBeforeInput, setEditTypeDaysBeforeInput] = useState(
    String(DEFAULT_CALENDAR_REMINDER_POLICY.daysBeforeStart),
  );
  const [editTypeReminderTimeLocal, setEditTypeReminderTimeLocal] = useState(
    DEFAULT_CALENDAR_REMINDER_POLICY.reminderTimeLocal,
  );
  const [editTypeSaving, setEditTypeSaving] = useState(false);

  const [eventTypePendingDelete, setEventTypePendingDelete] = useState<CalendarEventTypeDto | null>(null);
  const [deletingEventType, setDeletingEventType] = useState(false);

  const [googleCalIntegrations, setGoogleCalIntegrations] = useState<IntegratedGoogleCalendarDto[]>([]);
  const [addCalModalOpen, setAddCalModalOpen] = useState(false);
  const [newCalName, setNewCalName] = useState("");
  const [newCalGoogleId, setNewCalGoogleId] = useState("");
  const [newCalDescription, setNewCalDescription] = useState("");
  const [savingCalIntegration, setSavingCalIntegration] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<IntegratedGoogleCalendarDto | null>(null);
  const [googleCalInfo, setGoogleCalInfo] = useState<{
    serviceAccountEmail: string | null;
    impersonatedUser: string | null;
  }>({ serviceAccountEmail: null, impersonatedUser: null });
  const [integrationPendingDelete, setIntegrationPendingDelete] = useState<IntegratedGoogleCalendarDto | null>(
    null,
  );
  const [deletingIntegration, setDeletingIntegration] = useState(false);

  const [roleRuleModalOpen, setRoleRuleModalOpen] = useState(false);
  const [roleRuleModalEventTypeId, setRoleRuleModalEventTypeId] = useState("");
  const [roleRuleSelectedRoleIds, setRoleRuleSelectedRoleIds] = useState<Set<string>>(() => new Set());
  const [roleRuleModalChannels, setRoleRuleModalChannels] = useState({
    inApp: true,
    email: false,
    sms: false,
  });

  const roleRuleEventTypeDropdownOptions = useMemo(
    () =>
      eventTypes.map((t) => ({
        value: t._id,
        label: t.name,
        secondaryLabel: !t.isActive ? "Inactive" : undefined,
      })),
    [eventTypes],
  );

  const roleRuleEventTypePlaceholder =
    eventTypes.length === 0 ? "No event types" : "Select event type";

  const roleRuleEventTypeTriggerContent = useMemo((): ReactNode => {
    const selected = eventTypes.find((t) => t._id === roleRuleModalEventTypeId);
    if (eventTypes.length === 0) {
      return (
        <span className="text-xs md:text-sm 2xl:text-base text-primary">No event types</span>
      );
    }
    if (selected) {
      const title = !selected.isActive ? `${selected.name} (inactive)` : selected.name;
      return (
        <span
          className="text-xs md:text-sm 2xl:text-base text-primary truncate min-w-0 flex-1 text-left"
          title={title}
        >
          {selected.name}
          {!selected.isActive ? " (inactive)" : ""}
        </span>
      );
    }
    return (
      <span className="text-xs md:text-sm 2xl:text-base text-secondary truncate min-w-0 flex-1 text-left">
        Select event type
      </span>
    );
  }, [eventTypes, roleRuleModalEventTypeId]);

  /** MUI TimePicker: portal host + panel width (same pattern as location modal). */
  const [eventTypeTimePickerHost, setEventTypeTimePickerHost] = useState<HTMLElement | null>(null);
  const [eventTypeTimePickerPanel, setEventTypeTimePickerPanel] = useState<HTMLElement | null>(null);
  const [eventTypePickerPaperWidth, setEventTypePickerPaperWidth] = useState(400);

  const eventTypeModalOpen = Boolean(editingType) || typeModalOpen;

  useEffect(() => {
    if (!eventTypeModalOpen || !eventTypeTimePickerPanel) return;
    const el = eventTypeTimePickerPanel;
    const update = () => setEventTypePickerPaperWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [eventTypeModalOpen, eventTypeTimePickerPanel]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, rolesRes, settings, integrations] = await Promise.all([
        calendarService.listEventTypesAll(),
        api.get(API_ENDPOINTS.ROLES),
        calendarService.getNotificationSettings(),
        calendarService.listGoogleCalendarIntegrations().catch(() => [] as IntegratedGoogleCalendarDto[]),
      ]);
      setEventTypes(typesRes);
      const rolesBody = rolesRes.data as { success?: boolean; data?: { roles: RoleOption[] } };
      const roleList = rolesBody.data?.roles ?? [];
      setRoles(roleList);
      setGoogleCalIntegrations(integrations);
      applySettings(settings);
    } catch {
      toast.error("Failed to load events & notifications settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!addCalModalOpen) return;
    calendarService
      .getGoogleCalendarIntegrationsInfo()
      .then((info) => setGoogleCalInfo(info))
      .catch(() => setGoogleCalInfo({ serviceAccountEmail: null, impersonatedUser: null }));
  }, [addCalModalOpen]);

  function applySettings(settings: CalendarNotificationSettingsDto) {
    setBindings(bindingsFromSettings(settings.roleEventBindings ?? []));
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const eventTypesWithRoleRules = useMemo(() => {
    const ids = new Set(bindings.map((b) => b.eventTypeId));
    return eventTypes.filter((t) => ids.has(t._id));
  }, [eventTypes, bindings]);

  const syncRoleRuleModalFromEventType = useCallback(
    (eventTypeId: string, sourceBindings: UiBinding[]) => {
      const typeBindings = sourceBindings.filter((b) => b.eventTypeId === eventTypeId);
      setRoleRuleSelectedRoleIds(new Set(typeBindings.map((b) => b.roleId)));
      const first = typeBindings[0];
      if (first) {
        setRoleRuleModalChannels({ ...DEFAULT_CHANNELS, ...first.channels });
      } else {
        setRoleRuleModalChannels({ inApp: true, email: false, sms: false });
      }
    },
    [],
  );

  const openRoleRuleModal = (preselectedEventTypeId?: string) => {
    const etId =
      preselectedEventTypeId ??
      eventTypes[0]?._id ??
      "";
    if (!etId) {
      toast.error("Add an event type first.");
      return;
    }
    setRoleRuleModalEventTypeId(etId);
    syncRoleRuleModalFromEventType(etId, bindings);
    setRoleRuleModalOpen(true);
  };

  const closeRoleRuleModal = () => {
    setRoleRuleModalOpen(false);
  };

  const handleRoleRuleModalEventTypeChange = (newEventTypeId: string) => {
    setRoleRuleModalEventTypeId(newEventTypeId);
    syncRoleRuleModalFromEventType(newEventTypeId, bindings);
  };

  const toggleRoleRuleModalRole = (roleId: string, checked: boolean) => {
    setRoleRuleSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(roleId);
      else next.delete(roleId);
      return next;
    });
  };

  const roleRuleSelectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const allRolesSelectedInModal =
    roles.length > 0 && roles.every((r) => roleRuleSelectedRoleIds.has(r._id));
  const someRolesSelectedInModal = roles.some((r) => roleRuleSelectedRoleIds.has(r._id));

  useLayoutEffect(() => {
    const el = roleRuleSelectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someRolesSelectedInModal && !allRolesSelectedInModal;
  }, [someRolesSelectedInModal, allRolesSelectedInModal, roleRuleModalOpen]);

  const toggleRoleRuleModalSelectAllRoles = useCallback(() => {
    setRoleRuleSelectedRoleIds((prev) => {
      const allIds = roles.map((r) => r._id);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) return new Set<string>();
      return new Set(allIds);
    });
  }, [roles]);

  const applyRoleRuleModal = () => {
    if (!roleRuleModalEventTypeId) {
      toast.error("Select an event type.");
      return;
    }
    setBindings((prev) => {
      const others = prev.filter((b) => b.eventTypeId !== roleRuleModalEventTypeId);
      const added: UiBinding[] = [];
      for (const r of roles) {
        if (roleRuleSelectedRoleIds.has(r._id)) {
          added.push({
            key: randomKey(),
            eventTypeId: roleRuleModalEventTypeId,
            roleId: r._id,
            channels: { ...DEFAULT_CHANNELS, ...roleRuleModalChannels },
            notifyReminders: true,
            notifyOnStart: true,
          });
        }
      }
      return [...others, ...added];
    });
    setRoleRuleModalOpen(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payloadRows = bindings.map(({ key: _k, ...rest }) => rest);
      const pairSeen = new Set<string>();
      const roleEventBindings = payloadRows.filter((row) => {
        const pair = `${row.eventTypeId}\0${row.roleId}`;
        if (pairSeen.has(pair)) return false;
        pairSeen.add(pair);
        return true;
      });
      const saved = await calendarService.updateNotificationSettings({
        roleEventBindings,
      });
      applySettings(saved);
      toast.success("Notification settings saved.");
    } catch {
      toast.error("Failed to save notification settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateType = async () => {
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
          daysBeforeStart: parseDaysBeforeSubmit(newTypeDaysBeforeInput),
          reminderTimeLocal:
            newTypeReminderTimeLocal?.length === 5 ? newTypeReminderTimeLocal : "09:00",
        },
      });
      setEventTypes((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setNewTypeName("");
      setNewTypeColor("#6B7280");
      setNewTypeActive(true);
      setNewTypeReminderMode(DEFAULT_CALENDAR_REMINDER_POLICY.mode);
      setNewTypeDaysBeforeInput(String(DEFAULT_CALENDAR_REMINDER_POLICY.daysBeforeStart));
      setNewTypeReminderTimeLocal(DEFAULT_CALENDAR_REMINDER_POLICY.reminderTimeLocal);
      setTypeModalOpen(false);
      toast.success("Event type created.");
    } catch {
      toast.error("Failed to create event type.");
    }
  };

  const openEditTypeModal = (t: CalendarEventTypeDto) => {
    setTypeModalOpen(false);
    setEditingType(t);
    setEditTypeName(t.name);
    setEditTypeColor(t.colorHex?.length === 7 ? t.colorHex : "#6B7280");
    setEditTypeActive(t.isActive);
    const rp = t.reminderPolicy ?? DEFAULT_CALENDAR_REMINDER_POLICY;
    setEditTypeReminderMode(rp.mode);
    setEditTypeDaysBeforeInput(String(rp.daysBeforeStart));
    setEditTypeReminderTimeLocal(rp.reminderTimeLocal?.length === 5 ? rp.reminderTimeLocal : "09:00");
  };

  const closeEditTypeModal = () => {
    setEditingType(null);
    setEditTypeSaving(false);
  };

  const handleSaveEditType = async () => {
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
          daysBeforeStart: parseDaysBeforeSubmit(editTypeDaysBeforeInput),
          reminderTimeLocal:
            editTypeReminderTimeLocal?.length === 5 ? editTypeReminderTimeLocal : "09:00",
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
  };

  const confirmDeleteEventType = async () => {
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
      throw new Error("delete failed");
    } finally {
      setDeletingEventType(false);
    }
  };

  const submitAddCalIntegration = async () => {
    if (!newCalName.trim()) {
      toast.error("Calendar name is required.");
      return;
    }
    if (!newCalGoogleId.trim()) {
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
        setGoogleCalIntegrations((prev) =>
          prev.map((x) => (x._id === updated._id ? updated : x)),
        );
        setAddCalModalOpen(false);
        setEditingIntegration(null);
        toast.success("Google Calendar updated.");
      } else {
        const created = await calendarService.createGoogleCalendarIntegration({
          name: newCalName.trim(),
          googleCalendarId: newCalGoogleId.trim(),
          ...(newCalDescription.trim() ? { description: newCalDescription.trim() } : {}),
        });
        setGoogleCalIntegrations((prev) =>
          [...prev, created].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        );
        setAddCalModalOpen(false);
        toast.success("Google Calendar integrated.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add calendar.";
      toast.error(msg);
    } finally {
      setSavingCalIntegration(false);
    }
  };

  const confirmDeleteIntegration = async () => {
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
      throw new Error("delete failed");
    } finally {
      setDeletingIntegration(false);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon
              className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary shrink-0"
              aria-hidden
            />
            Events & Notifications
          </h2>
        </div>

        <div className="bg-card-background rounded-xl overflow-hidden">
          <div className="h-4 rounded-t-xl bg-primary" aria-hidden />
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-primary">
                <Spinner size="xl" className="text-button-primary" />
                <span className="text-sm">Loading settings...</span>
              </div>
            ) : (
              <div className="space-y-8">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">Google calendars</h3>
                      <p className="text-xs text-tertiary mt-1 max-w-2xl">
                        Integrate calendars from the same Google account (service account / delegation). The calendar
                        events page shows events from all integrated calendars together. Use each calendar&apos;s ID
                        from Google Calendar settings.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCalName("");
                        setNewCalGoogleId("");
                        setNewCalDescription("");
                        setEditingIntegration(null);
                        setAddCalModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start"
                    >
                      <FiPlus className="w-3.5 h-3.5" aria-hidden />
                      Add calendar
                    </button>
                  </div>
                  <div className={eventTypesTableCardClass}>
                    <div className="overflow-x-auto overflow-y-auto">
                      <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                        <thead>
                          <tr className="bg-primary text-white">
                            <th className={eventTypesThFirstColClass}>Calendar</th>
                            <th className={eventTypesThFirstColClass}>Description</th>
                            <th className={eventTypesThActionsClass}>Integrated</th>
                            <th className={`${eventTypesThFirstColClass} min-w-[140px]`}>Calendar ID</th>
                            <th className={eventTypesThActionsClass}>Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-primary">
                          {googleCalIntegrations.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-12 px-5 text-center text-secondary text-sm">
                                No calendars integrated yet. Add one to sync and create events.
                              </td>
                            </tr>
                          ) : (
                            googleCalIntegrations.map((row, index) => (
                              <tr key={row._id} className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                                <td className={eventTypesTdFirstColClass}>
                                  <span className="font-medium text-primary">{row.name}</span>
                                </td>
                                <td className={eventTypesTdFirstColClass}>
                                  <span className="font-medium text-primary">
                                    {row.description?.trim() || "—"}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-center whitespace-nowrap">
                                  {format(new Date(row.createdAt), "PP")}
                                </td>
                                <td className={`${eventTypesTdFirstColClass} font-mono text-[10px] md:text-xs break-all`}>
                                  {row.googleCalendarId}
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <div className="inline-flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingIntegration(row);
                                        setNewCalName(row.name);
                                        setNewCalGoogleId(row.googleCalendarId);
                                        setNewCalDescription(row.description ?? "");
                                        setAddCalModalOpen(true);
                                      }}
                                      className="p-1 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer inline-flex"
                                      aria-label={`Edit calendar ${row.name}`}
                                      title="Edit"
                                    >
                                      <EditIcon className="w-4 h-4" aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIntegrationPendingDelete(row)}
                                      className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer inline-flex"
                                      aria-label={`Remove calendar ${row.googleCalendarId}`}
                                      title="Remove integration"
                                    >
                                      <DeleteIcon className="w-4 h-4" aria-hidden />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">Event types</h3>
                      <p className="text-xs text-tertiary mt-1 max-w-2xl">
                        Types appear on the calendar and in notification rules. Default types are created automatically.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingType(null);
                        setNewTypeName("");
                        setNewTypeColor("#6B7280");
                        setNewTypeActive(true);
                        setNewTypeReminderMode(DEFAULT_CALENDAR_REMINDER_POLICY.mode);
                        setNewTypeDaysBeforeInput(String(DEFAULT_CALENDAR_REMINDER_POLICY.daysBeforeStart));
                        setNewTypeReminderTimeLocal(DEFAULT_CALENDAR_REMINDER_POLICY.reminderTimeLocal);
                        setTypeModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start"
                    >
                      <FiPlus className="w-3.5 h-3.5" aria-hidden />
                      Add event type
                    </button>
                  </div>
                  <div className={eventTypesTableCardClass}>
                    {/* Desktop: table — matches EmployeeTrainingCard / training-management */}
                    <div className="hidden md:block overflow-x-auto overflow-y-auto">
                      <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                        <thead>
                          <tr className="bg-primary text-white">
                            <th className={eventTypesThFirstColClass}>Name</th>
                            <th className={eventTypesThActionsClass}>Color</th>
                            <th className={eventTypesThActionsClass}>Reminders</th>
                            <th className={eventTypesThActionsClass}>Status</th>
                            <th className={eventTypesThActionsClass}>Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-primary">
                          {eventTypes.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-12 px-5 text-center text-secondary text-sm">
                                No event types yet. Add one above.
                              </td>
                            </tr>
                          ) : (
                            eventTypes.map((t, index) => (
                              <tr key={t._id} className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                                <td className={eventTypesTdFirstColClass}>{t.name}</td>
                                <td className="py-3 px-2 text-center">
                                  <span
                                    className="inline-block w-8 h-8 rounded border border-gray-200"
                                    style={{ backgroundColor: t.colorHex }}
                                    title={t.colorHex}
                                  />
                                </td>
                                <td className="py-3 px-2 text-center align-top max-w-[200px] 2xl:max-w-xs">
                                  <span className="text-[10px] md:text-xs 2xl:text-sm text-primary leading-snug whitespace-normal break-words">
                                    {formatReminderSummary(t.reminderPolicy ?? DEFAULT_CALENDAR_REMINDER_POLICY)}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <span className={t.isActive ? "text-positive font-medium" : "text-secondary font-medium"}>
                                    {t.isActive ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openEditTypeModal(t)}
                                      className="p-1 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer"
                                      aria-label={`Edit ${t.name}`}
                                      title="Edit"
                                    >
                                      <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEventTypePendingDelete(t)}
                                      className="p-1 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer"
                                      aria-label={`Delete ${t.name}`}
                                      title="Delete"
                                    >
                                      <DeleteIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" aria-hidden />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile: stacked cards (same pattern as EmployeeTrainingCard) */}
                    <div className="md:hidden flex flex-col rounded-t-xl overflow-hidden">
                      <div className="p-5 flex flex-col">
                        {eventTypes.length === 0 ? (
                          <p className="text-sm text-secondary text-center py-8 px-2">No event types yet. Add one above.</p>
                        ) : (
                          <div className="divide-y divide-gray-200 -mx-5 px-5">
                            {eventTypes.map((t, index) => (
                              <div
                                key={`${t._id}-mobile`}
                                className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-primary whitespace-normal break-words">{t.name}</p>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-secondary shrink-0">Color:</span>
                                    <span
                                      className="inline-block w-8 h-8 rounded border border-gray-200 shrink-0"
                                      style={{ backgroundColor: t.colorHex }}
                                      title={t.colorHex}
                                    />
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-secondary shrink-0">Reminders:</span>
                                    <span className="text-primary min-w-0">
                                      {formatReminderSummary(t.reminderPolicy ?? DEFAULT_CALENDAR_REMINDER_POLICY)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-secondary shrink-0">Status:</span>
                                    <span className="text-primary">{t.isActive ? "Active" : "Inactive"}</span>
                                  </div>
                                </div>
                                <div className="mt-3 flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditTypeModal(t)}
                                    className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer"
                                    aria-label={`Edit ${t.name}`}
                                    title="Edit"
                                  >
                                    <EditIcon className="w-4 h-4" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEventTypePendingDelete(t)}
                                    className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer"
                                    aria-label={`Delete ${t.name}`}
                                    title="Delete"
                                  >
                                    <DeleteIcon className="w-4 h-4" aria-hidden />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-gray-200" />

                <div>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
                        Role notifications by event type
                      </h3>
                      <p className="text-xs text-tertiary mt-1 max-w-2xl">
                        Use the button to choose an event type, select which roles get notified, and set channels.
                        Notified users receive the event type&apos;s advance reminder schedule (in the location
                        timezone), a heads-up <span className="font-medium text-primary">1 hour before</span> start,
                        and a notification when the event begins. Use{" "}
                        <span className="font-medium text-primary">Save Settings</span> below to persist changes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openRoleRuleModal()}
                      disabled={eventTypes.length === 0 || roles.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FiPlus className="w-3.5 h-3.5" aria-hidden />
                      Assign roles
                    </button>
                  </div>
                  {eventTypes.length === 0 ? (
                    <p className="text-sm text-tertiary italic py-4">
                      Add an event type above to configure role notifications.
                    </p>
                  ) : roles.length === 0 ? (
                    <p className="text-sm text-tertiary italic py-4">
                      No roles are available. Create roles in user settings first.
                    </p>
                  ) : eventTypesWithRoleRules.length === 0 ? (
                    <p className="text-sm text-tertiary italic py-4 border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
                      No role rules yet. Click <span className="font-medium text-primary">Assign roles</span>{" "}
                      to create one.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {eventTypesWithRoleRules.map((t) => {
                        const roleNames = bindings
                          .filter((b) => b.eventTypeId === t._id)
                          .map((b) => roles.find((r) => r._id === b.roleId)?.name ?? "Role")
                          .join(", ");
                        return (
                          <li
                            key={t._id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-gray-200 rounded-lg p-4 bg-card-background"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span
                                className="inline-block w-3 h-3 rounded-sm border border-gray-200 shrink-0 mt-1"
                                style={{ backgroundColor: t.colorHex }}
                                aria-hidden
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-primary">{t.name}</p>
                                <p className="text-xs text-tertiary mt-1 break-words">
                                  <span className="font-medium text-secondary">Roles:</span> {roleNames}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openRoleRuleModal(t._id)}
                              className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-semibold rounded-lg border border-gray-300 text-primary hover:bg-gray-50 cursor-pointer self-start sm:self-center"
                            >
                              <EditIcon className="w-3.5 h-3.5" aria-hidden />
                              Edit
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveSettings}
                    className="px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {editingType && (
        <div
          ref={setEventTypeTimePickerHost}
          className="fixed inset-0 z-[400] grid place-items-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditTypeModal();
          }}
        >
          <div className="relative w-full max-w-md min-w-0">
            <button
              type="button"
              onClick={closeEditTypeModal}
              className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[401] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              aria-label="Close"
              title="Close"
            >
              <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
            </button>
            <div
              ref={setEventTypeTimePickerPanel}
              className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden"
            >
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 id="edit-event-type-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                  Edit event type
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto border-x border-gray-200 space-y-4">
                <div>
                  <label
                    htmlFor="edit-event-type-name"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="edit-event-type-name"
                    type="text"
                    value={editTypeName}
                    onChange={(e) => setEditTypeName(e.target.value)}
                    className={fieldInputClass}
                    placeholder="Event type name"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-event-type-color"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Color
                  </label>
                  <input
                    id="edit-event-type-color"
                    type="color"
                    value={editTypeColor?.length === 7 ? editTypeColor : "#6B7280"}
                    onChange={(e) => setEditTypeColor(e.target.value)}
                    className={colorSwatchInputClass}
                  />
                </div>
                <div>
                  <span
                    id="edit-event-type-status-label"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Status
                  </span>
                  <Dropdown
                    options={eventTypeStatusDropdownOptions}
                    value={editTypeActive ? "active" : "inactive"}
                    onChange={(v) => setEditTypeActive(v === "active")}
                    placeholder="Status"
                    aria-label="Status"
                    aria-labelledby="edit-event-type-status-label"
                    className="w-full"
                    allowEmpty={false}
                    disabled={editTypeSaving}
                  />
                  <p className="text-xs text-tertiary mt-1">
                    Active types appear on the calendar and in notification rules.
                  </p>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-primary">Reminder schedule</p>
                  <p className="text-xs text-tertiary">
                    Uses each event location&apos;s timezone when sending.
                  </p>
                  <div>
                    <span
                      id="edit-event-type-reminder-mode-label"
                      className="block text-xs md:text-sm font-medium text-secondary mb-1"
                    >
                      Mode
                    </span>
                    <Dropdown
                      options={eventTypeReminderModeDropdownOptions}
                      value={editTypeReminderMode}
                      onChange={(v) => setEditTypeReminderMode(v as "daily_until" | "single")}
                      placeholder="Mode"
                      aria-label="Reminder mode"
                      aria-labelledby="edit-event-type-reminder-mode-label"
                      className="w-full"
                      allowEmpty={false}
                      disabled={editTypeSaving}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-event-type-days-before"
                      className="block text-xs md:text-sm font-medium text-secondary mb-1"
                    >
                      Days before start
                    </label>
                    <input
                      id="edit-event-type-days-before"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={editTypeDaysBeforeInput}
                      onChange={(e) => setEditTypeDaysBeforeInput(sanitizeDaysBeforeInput(e.target.value))}
                      className={fieldInputClass}
                    />
                  </div>
                  <div>
                    <span
                      id="edit-event-type-reminder-time-label"
                      className="block text-xs md:text-sm font-medium text-secondary mb-1"
                    >
                      Send at (local time)
                    </span>
                    <AnalogTimePickerField
                      value={editTypeReminderTimeLocal}
                      onChange={setEditTypeReminderTimeLocal}
                      fallbackTime={DEFAULT_CALENDAR_REMINDER_POLICY.reminderTimeLocal}
                      pickerPaperWidth={eventTypePickerPaperWidth}
                      pickerPopperContainer={eventTypeTimePickerHost}
                      pickerModalPanel={eventTypeTimePickerPanel}
                      labelledBy="edit-event-type-reminder-time-label"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeEditTypeModal}
                    disabled={editTypeSaving}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveEditType()}
                    disabled={editTypeSaving}
                    className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {editTypeSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {typeModalOpen && (
        <div
          ref={setEventTypeTimePickerHost}
          className="fixed inset-0 z-[400] grid place-items-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTypeModalOpen(false);
          }}
        >
          <div className="relative w-full max-w-md min-w-0">
            <button
              type="button"
              onClick={() => setTypeModalOpen(false)}
              className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[401] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              aria-label="Close"
              title="Close"
            >
              <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
            </button>
            <div
              ref={setEventTypeTimePickerPanel}
              className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden"
            >
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 id="new-event-type-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                  New event type
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto border-x border-gray-200 space-y-4">
                <div>
                  <label
                    htmlFor="new-event-type-name"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="new-event-type-name"
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    className={fieldInputClass}
                    placeholder="e.g. Inventory audit"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-event-type-color"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Color
                  </label>
                  <input
                    id="new-event-type-color"
                    type="color"
                    value={newTypeColor?.length === 7 ? newTypeColor : "#6B7280"}
                    onChange={(e) => setNewTypeColor(e.target.value)}
                    className={colorSwatchInputClass}
                  />
                </div>
                <div>
                  <span
                    id="new-event-type-status-label"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Status
                  </span>
                  <Dropdown
                    options={eventTypeStatusDropdownOptions}
                    value={newTypeActive ? "active" : "inactive"}
                    onChange={(v) => setNewTypeActive(v === "active")}
                    placeholder="Status"
                    aria-label="Status"
                    aria-labelledby="new-event-type-status-label"
                    className="w-full"
                    allowEmpty={false}
                  />
                  <p className="text-xs text-tertiary mt-1">
                    Active types appear on the calendar and in notification rules.
                  </p>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-primary">Reminder schedule</p>
                  <p className="text-xs text-tertiary">
                    Uses each event location&apos;s timezone when sending.
                  </p>
                  <div>
                    <span
                      id="new-event-type-reminder-mode-label"
                      className="block text-xs md:text-sm font-medium text-secondary mb-1"
                    >
                      Mode
                    </span>
                    <Dropdown
                      options={eventTypeReminderModeDropdownOptions}
                      value={newTypeReminderMode}
                      onChange={(v) => setNewTypeReminderMode(v as "daily_until" | "single")}
                      placeholder="Mode"
                      aria-label="Reminder mode"
                      aria-labelledby="new-event-type-reminder-mode-label"
                      className="w-full"
                      allowEmpty={false}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="new-event-type-days-before"
                      className="block text-xs md:text-sm font-medium text-secondary mb-1"
                    >
                      Days before start
                    </label>
                    <input
                      id="new-event-type-days-before"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={newTypeDaysBeforeInput}
                      onChange={(e) => setNewTypeDaysBeforeInput(sanitizeDaysBeforeInput(e.target.value))}
                      className={fieldInputClass}
                    />
                  </div>
                  <div>
                    <span
                      id="new-event-type-reminder-time-label"
                      className="block text-xs md:text-sm font-medium text-secondary mb-1"
                    >
                      Send at (local time)
                    </span>
                    <AnalogTimePickerField
                      value={newTypeReminderTimeLocal}
                      onChange={setNewTypeReminderTimeLocal}
                      fallbackTime={DEFAULT_CALENDAR_REMINDER_POLICY.reminderTimeLocal}
                      pickerPaperWidth={eventTypePickerPaperWidth}
                      pickerPopperContainer={eventTypeTimePickerHost}
                      pickerModalPanel={eventTypeTimePickerPanel}
                      labelledBy="new-event-type-reminder-time-label"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setTypeModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateType()}
                    className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 cursor-pointer"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {roleRuleModalOpen && (
        <div
          className="fixed inset-0 z-[390] grid place-items-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRoleRuleModal();
          }}
        >
          <div className="relative w-full max-w-lg min-w-0">
            <button
              type="button"
              onClick={closeRoleRuleModal}
              className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[391] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              aria-label="Close"
              title="Close"
            >
              <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
            </button>
            <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 id="role-rule-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                  Notify roles
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto space-y-5 border-x border-gray-200">
                <div>
                  <span
                    id="role-rule-event-type-label"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Event type
                  </span>
                  <Dropdown
                    options={roleRuleEventTypeDropdownOptions}
                    value={roleRuleModalEventTypeId}
                    onChange={handleRoleRuleModalEventTypeChange}
                    placeholder={roleRuleEventTypePlaceholder}
                    aria-label="Event type"
                    aria-labelledby="role-rule-event-type-label"
                    className="w-full"
                    allowEmpty={false}
                    disabled={eventTypes.length === 0}
                    triggerLabel={roleRuleEventTypeTriggerContent}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-xs md:text-sm font-medium text-secondary">Roles to notify</p>
                    {roles.length > 0 ? (
                      <label
                        htmlFor="role-rule-select-all"
                        className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer shrink-0 font-medium"
                      >
                        <input
                          ref={roleRuleSelectAllCheckboxRef}
                          id="role-rule-select-all"
                          type="checkbox"
                          checked={allRolesSelectedInModal}
                          onChange={toggleRoleRuleModalSelectAllRoles}
                          className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30 h-4 w-4 shrink-0"
                        />
                        Select all
                      </label>
                    ) : null}
                  </div>
                  <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100 bg-[#F9FAFB]">
                    {roles.map((r) => {
                      const id = `role-rule-role-${r._id}`;
                      return (
                        <li key={r._id} className="px-3 py-2.5">
                          <label htmlFor={id} className="flex items-center gap-2.5 text-sm text-primary cursor-pointer">
                            <input
                              id={id}
                              type="checkbox"
                              checked={roleRuleSelectedRoleIds.has(r._id)}
                              onChange={(e) => toggleRoleRuleModalRole(r._id, e.target.checked)}
                              className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30 h-4 w-4 shrink-0"
                            />
                            {r.name}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-primary">Channels</p>
                  <p className="text-xs text-tertiary">Applied to every selected role for this event type.</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleRuleModalChannels.inApp}
                        onChange={(e) =>
                          setRoleRuleModalChannels((c) => ({ ...c, inApp: e.target.checked }))
                        }
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      In-app
                    </label>
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleRuleModalChannels.email}
                        onChange={(e) =>
                          setRoleRuleModalChannels((c) => ({ ...c, email: e.target.checked }))
                        }
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      Email
                    </label>
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleRuleModalChannels.sms}
                        onChange={(e) =>
                          setRoleRuleModalChannels((c) => ({ ...c, sms: e.target.checked }))
                        }
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      SMS
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeRoleRuleModal}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyRoleRuleModal}
                    className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {addCalModalOpen && (
        <div
          className="fixed inset-0 z-[400] grid place-items-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddCalModalOpen(false);
          }}
        >
          <div className="relative w-full max-w-md min-w-0">
            <button
              type="button"
              onClick={() => setAddCalModalOpen(false)}
              className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[401] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              aria-label="Close"
              title="Close"
            >
              <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
            </button>
            <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                  {editingIntegration ? "Edit Google calendar" : "Add Google calendar"}
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto border-x border-gray-200 space-y-4">
                <div>
                  <label htmlFor="new-cal-name" className="block text-xs md:text-sm font-medium text-secondary mb-1">
                    Calendar name
                  </label>
                  <input
                    id="new-cal-name"
                    type="text"
                    value={newCalName}
                    onChange={(e) => setNewCalName(e.target.value)}
                    className={fieldInputClass}
                    placeholder="e.g. Catering"
                    maxLength={200}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label
                      htmlFor="new-cal-google-id"
                      className="block text-xs md:text-sm font-medium text-secondary"
                    >
                      Google Calendar ID
                    </label>
                    <span
                      className="inline-flex items-center justify-center text-tertiary cursor-help"
                      title={
                        [
                          "If you see “not found / cannot access”, share the calendar with the service account email used by this server (or set up domain-wide delegation).",
                          googleCalInfo.serviceAccountEmail
                            ? `Service account email: ${googleCalInfo.serviceAccountEmail}`
                            : "Service account email: (not available)",
                          googleCalInfo.impersonatedUser
                            ? `Impersonated user (delegation): ${googleCalInfo.impersonatedUser}`
                            : "",
                          "Google Calendar → Settings for my calendars → (calendar) → Share with specific people → Add the service account email with permission “Make changes to events”.",
                        ]
                          .filter(Boolean)
                          .join("\n")
                      }
                      aria-label="How to grant calendar access"
                    >
                      <FiInfo className="w-4 h-4" aria-hidden />
                    </span>
                  </div>
                  <input
                    id="new-cal-google-id"
                    type="text"
                    value={newCalGoogleId}
                    onChange={(e) => setNewCalGoogleId(e.target.value)}
                    className={fieldInputClass}
                    placeholder="e.g. group.calendar.google.com/calendar-id or email"
                    autoComplete="off"
                    disabled={editingIntegration != null}
                  />
                  <p className="text-xs text-tertiary mt-1">
                    From Google Calendar: Settings for my calendars → Integrate calendar → Calendar ID.
                  </p>
                </div>
                <div>
                  <label htmlFor="new-cal-desc" className="block text-xs md:text-sm font-medium text-secondary mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    id="new-cal-desc"
                    value={newCalDescription}
                    onChange={(e) => setNewCalDescription(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className={`${fieldInputClass} resize-y min-h-[72px]`}
                    placeholder="e.g. Catering schedule"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddCalModalOpen(false)}
                    disabled={savingCalIntegration}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitAddCalIntegration()}
                    disabled={savingCalIntegration}
                    className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {savingCalIntegration ? "Saving…" : editingIntegration ? "Save changes" : "Add calendar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={integrationPendingDelete != null}
        onClose={() => setIntegrationPendingDelete(null)}
        title="Remove Google calendar"
        message={
          integrationPendingDelete
            ? `Remove “${
                integrationPendingDelete.description?.trim() || integrationPendingDelete.googleCalendarId
              }”? All dashboard events linked to this calendar will be permanently deleted from the database, scheduled notifications for those events will be cancelled, and those events will be removed from Google Calendar. This cannot be undone.`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingIntegration}
        onConfirm={confirmDeleteIntegration}
      />

      <ConfirmDialog
        isOpen={eventTypePendingDelete != null}
        onClose={() => setEventTypePendingDelete(null)}
        title="Delete event type"
        message={
          eventTypePendingDelete
            ? `Delete “${eventTypePendingDelete.name}”? Existing calendar events may become invalid.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingEventType}
        onConfirm={confirmDeleteEventType}
      />
    </Layout>
  );
};

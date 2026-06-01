import {
  useCallback,
  type Dispatch,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { AnalogTimePickerField } from "../../components/common/AnalogTimePickerField";
import { Dropdown, type DropdownOption } from "../../components/common/Dropdown";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { UnsavedChangesBar } from "../../components/common/UnsavedChangesBar";
import { ConfirmDialog } from "../../components/modal/ConfirmDialog";
import { useUnsavedChangesNavigationGuard } from "../../hooks/useUnsavedChangesNavigationGuard";
import { calendarBindingsEqual } from "../../utils/settingsDirtyStateHelpers";
import { calendarService } from "../../services/calendar.service";
import { format } from "date-fns";
import {
  DEFAULT_CALENDAR_REMINDER_POLICY,
  type CalendarEventTypeDto,
  type CalendarRoleEventBindingDto,
  type IntegratedGoogleCalendarDto,
} from "../../types/calendar.types";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";
import EditIcon from "@assets/icons/edit.svg?react";
import DeleteIcon from "@assets/icons/delete.svg?react";
import { FiInfo, FiPlus } from "react-icons/fi";
import { getFirstEventTypeId, getRoleNamesForEventType } from "../../utils/eventsNotificationsSettingsHelpers";
import {
  createEventType,
  deleteEventType,
  deleteGoogleCalendarIntegration,
  saveEditedEventType,
  saveNotificationSettings,
  upsertGoogleCalendarIntegration,
} from "../../utils/eventsNotificationsSettingsActions";
import { loadEventsNotificationsSettings } from "../../utils/eventsNotificationsSettingsPageLoad";
import { getRoleRuleModalState } from "../../utils/eventsNotificationsSettingsRoleRuleHelpers";

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
  const n = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(365, Math.max(0, n));
}

function sanitizeDaysBeforeInput(value: string): string {
  return value.replaceAll(/\D/g, "").slice(0, 3);
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

function RoleRuleEventTypeTriggerContent({
  eventTypes,
  selectedEventTypeId,
}: Readonly<{
  eventTypes: CalendarEventTypeDto[];
  selectedEventTypeId: string;
}>) {
  if (eventTypes.length === 0) {
    return <span className="text-xs md:text-sm 2xl:text-base text-primary">No event types</span>;
  }
  const selected = eventTypes.find((t) => t._id === selectedEventTypeId);
  if (!selected) {
    return (
      <span className="text-xs md:text-sm 2xl:text-base text-secondary truncate min-w-0 flex-1 text-left">
        Select event type
      </span>
    );
  }
  const title = selected.isActive ? selected.name : `${selected.name} (inactive)`;
  return (
    <span
      className="text-xs md:text-sm 2xl:text-base text-primary truncate min-w-0 flex-1 text-left"
      title={title}
    >
      {selected.name}
      {selected.isActive ? "" : " (inactive)"}
    </span>
  );
}

function RoleRulesSummarySection({
  eventTypes,
  roles,
  eventTypesWithRoleRules,
  bindings,
  onEditRoles,
}: Readonly<{
  eventTypes: CalendarEventTypeDto[];
  roles: RoleOption[];
  eventTypesWithRoleRules: CalendarEventTypeDto[];
  bindings: UiBinding[];
  onEditRoles: (eventTypeId: string) => void;
}>) {
  if (eventTypes.length === 0) {
    return (
      <p className="text-sm text-tertiary italic py-4">
        Add an event type above to configure role notifications.
      </p>
    );
  }
  if (roles.length === 0) {
    return (
      <p className="text-sm text-tertiary italic py-4">
        No roles are available. Create roles in user settings first.
      </p>
    );
  }
  if (eventTypesWithRoleRules.length === 0) {
    return (
      <p className="text-sm text-tertiary italic py-4 border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
        No role rules yet. Click <span className="font-medium text-primary">Assign roles</span> to create one.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {eventTypesWithRoleRules.map((t) => {
        const roleNames = getRoleNamesForEventType({ eventTypeId: t._id, bindings, roles });
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
              onClick={() => onEditRoles(t._id)}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-semibold rounded-lg border border-gray-300 text-primary hover:bg-gray-50 cursor-pointer self-start sm:self-center"
            >
              <EditIcon className="w-3.5 h-3.5" aria-hidden />
              Edit
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EventsNotificationsSettingsLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-primary">
      <Spinner size="xl" className="text-button-primary" />
      <span className="text-sm">Loading settings...</span>
    </div>
  );
}

function EventsNotificationsSettingsHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
      <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
        <AdminAndSettingsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary shrink-0" aria-hidden />
        Events & Notifications
      </h2>
    </div>
  );
}

function EventsNotificationsSettingsShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-card-background rounded-xl overflow-hidden">
      <div className="h-4 rounded-t-xl bg-primary" aria-hidden />
      <div className="p-6">{children}</div>
    </div>
  );
}

function EventsNotificationsSettingsConfirmDialogs({
  integrationPendingDelete,
  setIntegrationPendingDelete,
  deletingIntegration,
  confirmDeleteIntegration,
  eventTypePendingDelete,
  setEventTypePendingDelete,
  deletingEventType,
  confirmDeleteEventType,
}: Readonly<{
  integrationPendingDelete: IntegratedGoogleCalendarDto | null;
  setIntegrationPendingDelete: (v: IntegratedGoogleCalendarDto | null) => void;
  deletingIntegration: boolean;
  confirmDeleteIntegration: () => Promise<void>;
  eventTypePendingDelete: CalendarEventTypeDto | null;
  setEventTypePendingDelete: (v: CalendarEventTypeDto | null) => void;
  deletingEventType: boolean;
  confirmDeleteEventType: () => Promise<void>;
}>) {
  const integrationMessage =
    integrationPendingDelete == null
      ? ""
      : `Remove “${integrationPendingDelete.description?.trim() || integrationPendingDelete.googleCalendarId
      }”? All dashboard events linked to this calendar will be permanently deleted from the database, scheduled notifications for those events will be cancelled, and those events will be removed from Google Calendar. This cannot be undone.`;

  const eventTypeMessage =
    eventTypePendingDelete == null ? "" : `Delete “${eventTypePendingDelete.name}”? Existing calendar events may become invalid.`;

  return (
    <>
      <ConfirmDialog
        isOpen={integrationPendingDelete != null}
        onClose={() => setIntegrationPendingDelete(null)}
        title="Remove Google calendar"
        message={integrationMessage}
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
        message={eventTypeMessage}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingEventType}
        onConfirm={confirmDeleteEventType}
      />
    </>
  );
}

function EventsNotificationsSettingsMain({
  googleCalIntegrations,
  onAddCalendar,
  onEditCalendar,
  onDeleteCalendar,
  eventTypes,
  onAddEventType,
  onEditEventType,
  onDeleteEventType,
  eventTypesWithRoleRules,
  bindings,
  roles,
  onAssignRoles,
}: Readonly<{
  googleCalIntegrations: IntegratedGoogleCalendarDto[];
  onAddCalendar: () => void;
  onEditCalendar: (row: IntegratedGoogleCalendarDto) => void;
  onDeleteCalendar: (row: IntegratedGoogleCalendarDto) => void;
  eventTypes: CalendarEventTypeDto[];
  onAddEventType: () => void;
  onEditEventType: (t: CalendarEventTypeDto) => void;
  onDeleteEventType: (t: CalendarEventTypeDto) => void;
  eventTypesWithRoleRules: CalendarEventTypeDto[];
  bindings: UiBinding[];
  roles: RoleOption[];
  onAssignRoles: (eventTypeId?: string) => void;
}>) {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">Google calendars</h3>
            <p className="text-xs text-tertiary mt-1 max-w-2xl">
              Integrate calendars from the same Google account (service account / delegation). The calendar events page
              shows events from all integrated calendars together. Use each calendar&apos;s ID from Google Calendar
              settings.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddCalendar}
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
                        <span className="font-medium text-primary">{row.description?.trim() || "—"}</span>
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">{format(new Date(row.createdAt), "PP")}</td>
                      <td className={`${eventTypesTdFirstColClass} font-mono text-[10px] md:text-xs break-all`}>
                        {row.googleCalendarId}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="inline-flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => onEditCalendar(row)}
                            className="p-1 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer inline-flex"
                            aria-label={`Edit calendar ${row.name}`}
                            title="Edit"
                          >
                            <EditIcon className="w-4 h-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCalendar(row)}
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
            onClick={onAddEventType}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start"
          >
            <FiPlus className="w-3.5 h-3.5" aria-hidden />
            Add event type
          </button>
        </div>
        <div className={eventTypesTableCardClass}>
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
                            onClick={() => onEditEventType(t)}
                            className="p-1 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer"
                            aria-label={`Edit ${t.name}`}
                            title="Edit"
                          >
                            <EditIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEventType(t)}
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
                          onClick={() => onEditEventType(t)}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors cursor-pointer"
                          aria-label={`Edit ${t.name}`}
                          title="Edit"
                        >
                          <EditIcon className="w-4 h-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteEventType(t)}
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
            <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">Role notifications by event type</h3>
            <p className="text-xs text-tertiary mt-1 max-w-2xl">
              Use the button to choose an event type, select which roles get notified, and set channels. Notified users
              receive the event type&apos;s advance reminder schedule (in the location timezone), a heads-up{" "}
              <span className="font-medium text-primary">1 hour before</span> start, and a notification when the event
              begins. Use the save bar at the bottom of the screen to persist role notification changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onAssignRoles()}
            disabled={eventTypes.length === 0 || roles.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiPlus className="w-3.5 h-3.5" aria-hidden />
            Assign roles
          </button>
        </div>
        <RoleRulesSummarySection
          eventTypes={eventTypes}
          roles={roles}
          eventTypesWithRoleRules={eventTypesWithRoleRules}
          bindings={bindings}
          onEditRoles={(id) => onAssignRoles(id)}
        />
      </div>
    </div>
  );
}

function EventsNotificationsSettingsModals({
  editingType,
  typeModalOpen,
  roleRuleModalOpen,
  addCalModalOpen,
  setEventTypeTimePickerHost,
  setEventTypeTimePickerPanel,
  eventTypeTimePickerHost,
  eventTypeTimePickerPanel,
  eventTypePickerPaperWidth,
  closeEditTypeModal,
  editTypeName,
  setEditTypeName,
  editTypeColor,
  setEditTypeColor,
  editTypeActive,
  setEditTypeActive,
  editTypeReminderMode,
  setEditTypeReminderMode,
  editTypeDaysBeforeInput,
  setEditTypeDaysBeforeInput,
  editTypeReminderTimeLocal,
  setEditTypeReminderTimeLocal,
  editTypeSaving,
  onSaveEditType,
  setTypeModalOpen,
  newTypeName,
  setNewTypeName,
  newTypeColor,
  setNewTypeColor,
  newTypeActive,
  setNewTypeActive,
  newTypeReminderMode,
  setNewTypeReminderMode,
  newTypeDaysBeforeInput,
  setNewTypeDaysBeforeInput,
  newTypeReminderTimeLocal,
  setNewTypeReminderTimeLocal,
  onCreateType,
  closeRoleRuleModal,
  roleRuleEventTypeDropdownOptions,
  roleRuleModalEventTypeId,
  handleRoleRuleModalEventTypeChange,
  roleRuleEventTypePlaceholder,
  roleRuleEventTypeTriggerContent,
  disableRoleRuleEventTypeSelect,
  roles,
  roleRuleSelectAllCheckboxRef,
  allRolesSelectedInModal,
  toggleRoleRuleModalSelectAllRoles,
  roleRuleSelectedRoleIds,
  toggleRoleRuleModalRole,
  roleRuleModalChannels,
  setRoleRuleModalChannels,
  applyRoleRuleModal,
  editingIntegration,
  googleCalInfo,
  newCalName,
  setNewCalName,
  newCalGoogleId,
  setNewCalGoogleId,
  newCalDescription,
  setNewCalDescription,
  setAddCalModalOpen,
  savingCalIntegration,
  submitAddCalIntegration,
  addCalSubmitLabel,
}: Readonly<{
  editingType: CalendarEventTypeDto | null;
  typeModalOpen: boolean;
  roleRuleModalOpen: boolean;
  addCalModalOpen: boolean;
  setEventTypeTimePickerHost: (el: HTMLElement | null) => void;
  setEventTypeTimePickerPanel: (el: HTMLElement | null) => void;
  eventTypeTimePickerHost: HTMLElement | null;
  eventTypeTimePickerPanel: HTMLElement | null;
  eventTypePickerPaperWidth: number;
  closeEditTypeModal: () => void;
  editTypeName: string;
  setEditTypeName: (v: string) => void;
  editTypeColor: string;
  setEditTypeColor: (v: string) => void;
  editTypeActive: boolean;
  setEditTypeActive: (v: boolean) => void;
  editTypeReminderMode: "daily_until" | "single";
  setEditTypeReminderMode: (v: "daily_until" | "single") => void;
  editTypeDaysBeforeInput: string;
  setEditTypeDaysBeforeInput: (v: string) => void;
  editTypeReminderTimeLocal: string;
  setEditTypeReminderTimeLocal: (v: string) => void;
  editTypeSaving: boolean;
  onSaveEditType: () => void;
  setTypeModalOpen: (v: boolean) => void;
  newTypeName: string;
  setNewTypeName: (v: string) => void;
  newTypeColor: string;
  setNewTypeColor: (v: string) => void;
  newTypeActive: boolean;
  setNewTypeActive: (v: boolean) => void;
  newTypeReminderMode: "daily_until" | "single";
  setNewTypeReminderMode: (v: "daily_until" | "single") => void;
  newTypeDaysBeforeInput: string;
  setNewTypeDaysBeforeInput: (v: string) => void;
  newTypeReminderTimeLocal: string;
  setNewTypeReminderTimeLocal: (v: string) => void;
  onCreateType: () => void;
  closeRoleRuleModal: () => void;
  roleRuleEventTypeDropdownOptions: DropdownOption[];
  roleRuleModalEventTypeId: string;
  handleRoleRuleModalEventTypeChange: (v: string) => void;
  roleRuleEventTypePlaceholder: string;
  roleRuleEventTypeTriggerContent: ReactNode;
  disableRoleRuleEventTypeSelect: boolean;
  roles: RoleOption[];
  roleRuleSelectAllCheckboxRef: React.RefObject<HTMLInputElement | null>;
  allRolesSelectedInModal: boolean;
  toggleRoleRuleModalSelectAllRoles: () => void;
  roleRuleSelectedRoleIds: Set<string>;
  toggleRoleRuleModalRole: (roleId: string, checked: boolean) => void;
  roleRuleModalChannels: { inApp: boolean; email: boolean; sms: boolean };
  setRoleRuleModalChannels: Dispatch<SetStateAction<{ inApp: boolean; email: boolean; sms: boolean }>>;
  applyRoleRuleModal: () => void;
  editingIntegration: IntegratedGoogleCalendarDto | null;
  googleCalInfo: { serviceAccountEmail: string | null; impersonatedUser: string | null };
  newCalName: string;
  setNewCalName: (v: string) => void;
  newCalGoogleId: string;
  setNewCalGoogleId: (v: string) => void;
  newCalDescription: string;
  setNewCalDescription: (v: string) => void;
  setAddCalModalOpen: (v: boolean) => void;
  savingCalIntegration: boolean;
  submitAddCalIntegration: () => void;
  addCalSubmitLabel: string;
}>) {
  return (
    <>
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
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-event-type-title"
            >
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 id="edit-event-type-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                  Edit event type
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto border-x border-gray-200 space-y-4">
                <div>
                  <label htmlFor="edit-event-type-name" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                  <label htmlFor="edit-event-type-color" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                  <span id="edit-event-type-status-label" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                  <p className="text-xs text-tertiary mt-1">Active types appear on the calendar and in notification rules.</p>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-primary">Reminder schedule</p>
                  <p className="text-xs text-tertiary">Uses each event location&apos;s timezone when sending.</p>
                  <div>
                    <span id="edit-event-type-reminder-mode-label" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                    <label htmlFor="edit-event-type-days-before" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                    <span id="edit-event-type-reminder-time-label" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                    onClick={onSaveEditType}
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
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-event-type-modal-title"
            >
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 id="new-event-type-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                  New event type
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto border-x border-gray-200 space-y-4">
                <div>
                  <label htmlFor="new-event-type-name" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                  <label htmlFor="new-event-type-color" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                  <span id="new-event-type-status-label" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                  <p className="text-xs text-tertiary mt-1">Active types appear on the calendar and in notification rules.</p>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-primary">Reminder schedule</p>
                  <p className="text-xs text-tertiary">Uses each event location&apos;s timezone when sending.</p>
                  <div>
                    <span id="new-event-type-reminder-mode-label" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                    <label htmlFor="new-event-type-days-before" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                    <span id="new-event-type-reminder-time-label" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                    onClick={onCreateType}
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
            <div
              className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="role-rule-modal-title"
            >
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 id="role-rule-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
                  Notify roles
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto space-y-5 border-x border-gray-200">
                <div>
                  <span id="role-rule-event-type-label" className="block text-xs md:text-sm font-medium text-secondary mb-1">
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
                    disabled={disableRoleRuleEventTypeSelect}
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
                        <span>Select all</span>
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
                            <span>{r.name}</span>
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
                        onChange={(e) => setRoleRuleModalChannels((c) => ({ ...c, inApp: e.target.checked }))}
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      <span>In-app</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleRuleModalChannels.email}
                        onChange={(e) => setRoleRuleModalChannels((c) => ({ ...c, email: e.target.checked }))}
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      <span>Email</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleRuleModalChannels.sms}
                        onChange={(e) => setRoleRuleModalChannels((c) => ({ ...c, sms: e.target.checked }))}
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      <span>SMS</span>
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
            <div
              className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-cal-modal-title"
            >
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2 id="add-cal-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
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
                    <label htmlFor="new-cal-google-id" className="block text-xs md:text-sm font-medium text-secondary">
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
                          googleCalInfo.impersonatedUser ? `Impersonated user (delegation): ${googleCalInfo.impersonatedUser}` : "",
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
                    onClick={submitAddCalIntegration}
                    disabled={savingCalIntegration}
                    className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {addCalSubmitLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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

function EventsNotificationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventTypes, setEventTypes] = useState<CalendarEventTypeDto[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [bindings, setBindings] = useState<UiBinding[]>([]);
  const [savedBindings, setSavedBindings] = useState<UiBinding[]>([]);

  const hasUnsavedChanges = useMemo(() => {
    if (loading) return false;
    return !calendarBindingsEqual(bindings, savedBindings);
  }, [loading, bindings, savedBindings]);

  const blocker = useUnsavedChangesNavigationGuard(hasUnsavedChanges);

  const handleDiscardBindings = useCallback(() => {
    setBindings(
      savedBindings.map((b) => ({
        ...b,
        channels: { ...b.channels },
        key: randomKey(),
      })),
    );
  }, [savedBindings]);

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
        secondaryLabel: t.isActive ? undefined : "Inactive",
      })),
    [eventTypes],
  );

  const roleRuleEventTypePlaceholder =
    eventTypes.length === 0 ? "No event types" : "Select event type";

  const roleRuleEventTypeTriggerContent: ReactNode = (
    <RoleRuleEventTypeTriggerContent eventTypes={eventTypes} selectedEventTypeId={roleRuleModalEventTypeId} />
  );

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
      const { eventTypes: nextTypes, roles: nextRoles, settings, integrations } = await loadEventsNotificationsSettings();
      setEventTypes(nextTypes);
      setRoles(nextRoles);
      setGoogleCalIntegrations(integrations);
      const nextBindings = bindingsFromSettings(settings.roleEventBindings ?? []);
      setBindings(nextBindings);
      setSavedBindings(
        nextBindings.map((b) => ({
          ...b,
          channels: { ...b.channels },
          key: b.key,
        })),
      );
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const eventTypesWithRoleRules = useMemo(() => {
    const ids = new Set(bindings.map((b) => b.eventTypeId));
    return eventTypes.filter((t) => ids.has(t._id));
  }, [eventTypes, bindings]);

  const syncRoleRuleModalFromEventType = useCallback(
    (eventTypeId: string, sourceBindings: UiBinding[]) => {
      const { selectedRoleIds, channels } = getRoleRuleModalState({ eventTypeId, bindings: sourceBindings as never });
      setRoleRuleSelectedRoleIds(selectedRoleIds);
      setRoleRuleModalChannels(channels);
    },
    [],
  );

  const openRoleRuleModal = (preselectedEventTypeId?: string) => {
    const etId = preselectedEventTypeId ?? getFirstEventTypeId(eventTypes);
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
    await saveNotificationSettings({
      bindings: bindings as never,
      setSaving,
      applySettings: (settings) => {
        const nextBindings = bindingsFromSettings(settings.roleEventBindings ?? []);
        setBindings(nextBindings);
        setSavedBindings(
          nextBindings.map((b) => ({
            ...b,
            channels: { ...b.channels },
            key: b.key,
          })),
        );
      },
    });
  };

  const resetNewTypeFields = () => {
    setNewTypeName("");
    setNewTypeColor("#6B7280");
    setNewTypeActive(true);
    setNewTypeReminderMode(DEFAULT_CALENDAR_REMINDER_POLICY.mode);
    setNewTypeDaysBeforeInput(String(DEFAULT_CALENDAR_REMINDER_POLICY.daysBeforeStart));
    setNewTypeReminderTimeLocal(DEFAULT_CALENDAR_REMINDER_POLICY.reminderTimeLocal);
  };

  const handleCreateType = async () => {
    await createEventType({
      newTypeName,
      newTypeColor,
      newTypeActive,
      newTypeReminderMode,
      daysBeforeStart: parseDaysBeforeSubmit(newTypeDaysBeforeInput),
      reminderTimeLocal: newTypeReminderTimeLocal,
      setEventTypes,
      resetNewTypeFields,
      closeModal: () => setTypeModalOpen(false),
    });
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
    await saveEditedEventType({
      editingType,
      editTypeName,
      editTypeColor,
      editTypeActive,
      editTypeReminderMode,
      daysBeforeStart: parseDaysBeforeSubmit(editTypeDaysBeforeInput),
      reminderTimeLocal: editTypeReminderTimeLocal,
      setEditTypeSaving,
      setEventTypes,
      closeEditTypeModal,
    });
  };

  const confirmDeleteEventType = async () => {
    await deleteEventType({
      eventTypePendingDelete,
      setDeletingEventType,
      setEventTypes,
      setBindings: setBindings as never,
      setEventTypePendingDelete,
    });
  };

  const submitAddCalIntegration = async () => {
    await upsertGoogleCalendarIntegration({
      editingIntegration,
      newCalName,
      newCalGoogleId,
      newCalDescription,
      setSavingCalIntegration,
      setGoogleCalIntegrations,
      closeModal: () => setAddCalModalOpen(false),
      clearEditing: () => setEditingIntegration(null),
      isIdEditable: editingIntegration == null,
    });
  };

  const confirmDeleteIntegration = async () => {
    await deleteGoogleCalendarIntegration({
      integrationPendingDelete,
      setDeletingIntegration,
      setGoogleCalIntegrations,
      setIntegrationPendingDelete,
    });
  };

  let addCalSubmitLabel = "Add calendar";
  if (savingCalIntegration) addCalSubmitLabel = "Saving…";
  else if (editingIntegration) addCalSubmitLabel = "Save changes";

  const openAddCalendarModal = () => {
    setNewCalName("");
    setNewCalGoogleId("");
    setNewCalDescription("");
    setEditingIntegration(null);
    setAddCalModalOpen(true);
  };

  const openEditCalendarModal = (row: IntegratedGoogleCalendarDto) => {
    setEditingIntegration(row);
    setNewCalName(row.name);
    setNewCalGoogleId(row.googleCalendarId);
    setNewCalDescription(row.description ?? "");
    setAddCalModalOpen(true);
  };

  const openNewEventTypeModal = () => {
    setEditingType(null);
    resetNewTypeFields();
    setTypeModalOpen(true);
  };

  return (
    <Layout>
      <div className={`p-6 ${hasUnsavedChanges ? "pb-24" : ""}`}>
        <EventsNotificationsSettingsHeader />

        <EventsNotificationsSettingsShell>
          {loading ? (
            <EventsNotificationsSettingsLoading />
          ) : (
            <EventsNotificationsSettingsMain
              googleCalIntegrations={googleCalIntegrations}
              onAddCalendar={openAddCalendarModal}
              onEditCalendar={openEditCalendarModal}
              onDeleteCalendar={setIntegrationPendingDelete}
              eventTypes={eventTypes}
              onAddEventType={openNewEventTypeModal}
              onEditEventType={openEditTypeModal}
              onDeleteEventType={setEventTypePendingDelete}
              eventTypesWithRoleRules={eventTypesWithRoleRules}
              bindings={bindings}
              roles={roles}
              onAssignRoles={openRoleRuleModal}
            />
          )}
        </EventsNotificationsSettingsShell>
      </div>

      <UnsavedChangesBar
        visible={hasUnsavedChanges}
        onDiscard={handleDiscardBindings}
        onSave={() => void handleSaveSettings()}
        saving={saving}
        saveLabel={saving ? "Saving..." : "Save Settings"}
      />

      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        title="Unsaved changes"
        message="Unsaved role notification changes will be lost if you leave."
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />

      <EventsNotificationsSettingsModals
        editingType={editingType}
        typeModalOpen={typeModalOpen}
        roleRuleModalOpen={roleRuleModalOpen}
        addCalModalOpen={addCalModalOpen}
        setEventTypeTimePickerHost={setEventTypeTimePickerHost}
        setEventTypeTimePickerPanel={setEventTypeTimePickerPanel}
        eventTypeTimePickerHost={eventTypeTimePickerHost}
        eventTypeTimePickerPanel={eventTypeTimePickerPanel}
        eventTypePickerPaperWidth={eventTypePickerPaperWidth}
        closeEditTypeModal={closeEditTypeModal}
        editTypeName={editTypeName}
        setEditTypeName={setEditTypeName}
        editTypeColor={editTypeColor}
        setEditTypeColor={setEditTypeColor}
        editTypeActive={editTypeActive}
        setEditTypeActive={setEditTypeActive}
        editTypeReminderMode={editTypeReminderMode}
        setEditTypeReminderMode={setEditTypeReminderMode}
        editTypeDaysBeforeInput={editTypeDaysBeforeInput}
        setEditTypeDaysBeforeInput={setEditTypeDaysBeforeInput}
        editTypeReminderTimeLocal={editTypeReminderTimeLocal}
        setEditTypeReminderTimeLocal={setEditTypeReminderTimeLocal}
        editTypeSaving={editTypeSaving}
        onSaveEditType={() => void handleSaveEditType()}
        setTypeModalOpen={setTypeModalOpen}
        newTypeName={newTypeName}
        setNewTypeName={setNewTypeName}
        newTypeColor={newTypeColor}
        setNewTypeColor={setNewTypeColor}
        newTypeActive={newTypeActive}
        setNewTypeActive={setNewTypeActive}
        newTypeReminderMode={newTypeReminderMode}
        setNewTypeReminderMode={setNewTypeReminderMode}
        newTypeDaysBeforeInput={newTypeDaysBeforeInput}
        setNewTypeDaysBeforeInput={setNewTypeDaysBeforeInput}
        newTypeReminderTimeLocal={newTypeReminderTimeLocal}
        setNewTypeReminderTimeLocal={setNewTypeReminderTimeLocal}
        onCreateType={() => void handleCreateType()}
        closeRoleRuleModal={closeRoleRuleModal}
        roleRuleEventTypeDropdownOptions={roleRuleEventTypeDropdownOptions}
        roleRuleModalEventTypeId={roleRuleModalEventTypeId}
        handleRoleRuleModalEventTypeChange={handleRoleRuleModalEventTypeChange}
        roleRuleEventTypePlaceholder={roleRuleEventTypePlaceholder}
        roleRuleEventTypeTriggerContent={roleRuleEventTypeTriggerContent}
        disableRoleRuleEventTypeSelect={eventTypes.length === 0}
        roles={roles}
        roleRuleSelectAllCheckboxRef={roleRuleSelectAllCheckboxRef}
        allRolesSelectedInModal={allRolesSelectedInModal}
        toggleRoleRuleModalSelectAllRoles={toggleRoleRuleModalSelectAllRoles}
        roleRuleSelectedRoleIds={roleRuleSelectedRoleIds}
        toggleRoleRuleModalRole={toggleRoleRuleModalRole}
        roleRuleModalChannels={roleRuleModalChannels}
        setRoleRuleModalChannels={setRoleRuleModalChannels}
        applyRoleRuleModal={applyRoleRuleModal}
        editingIntegration={editingIntegration}
        googleCalInfo={googleCalInfo}
        newCalName={newCalName}
        setNewCalName={setNewCalName}
        newCalGoogleId={newCalGoogleId}
        setNewCalGoogleId={setNewCalGoogleId}
        newCalDescription={newCalDescription}
        setNewCalDescription={setNewCalDescription}
        setAddCalModalOpen={setAddCalModalOpen}
        savingCalIntegration={savingCalIntegration}
        submitAddCalIntegration={() => void submitAddCalIntegration()}
        addCalSubmitLabel={addCalSubmitLabel}
      />
      <EventsNotificationsSettingsConfirmDialogs
        integrationPendingDelete={integrationPendingDelete}
        setIntegrationPendingDelete={setIntegrationPendingDelete}
        deletingIntegration={deletingIntegration}
        confirmDeleteIntegration={confirmDeleteIntegration}
        eventTypePendingDelete={eventTypePendingDelete}
        setEventTypePendingDelete={setEventTypePendingDelete}
        deletingEventType={deletingEventType}
        confirmDeleteEventType={confirmDeleteEventType}
      />
    </Layout>
  );
}

export const EventsNotificationsSettings = () => <EventsNotificationsSettingsPage />;

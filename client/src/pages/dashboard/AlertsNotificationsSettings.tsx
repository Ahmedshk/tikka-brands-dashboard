import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Tooltip } from "@mui/material";
import toast from "react-hot-toast";
import { FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { UnsavedChangesBar } from "../../components/common/UnsavedChangesBar";
import { ConfirmDialog } from "../../components/modal/ConfirmDialog";
import { useUnsavedChangesNavigationGuard } from "../../hooks/useUnsavedChangesNavigationGuard";
import { stableJsonEqual } from "../../utils/settingsDirtyStateHelpers";
import { Dropdown, type DropdownOption } from "../../components/common/Dropdown";
import api from "../../services/api.service";
import { alertNotificationSettingsService } from "../../services/alertNotificationSettings.service";
import { API_ENDPOINTS } from "../../utils/constants";
import type {
  AlertFinancialLaborDto,
  AlertMetricTogglesDto,
  AlertNotificationSettingsDto,
  AlertRoleBindingCategory,
  AlertRunScheduleDto,
} from "../../types/alertNotification.types";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";
import EditIcon from "@assets/icons/edit.svg?react";
import { sanitizeDigitsOnlyInput } from "../../utils/digitsOnlyInput.util";
import {
  bindingSubKey,
  compareNotifyRoleRows,
  firstSubcategoryForNotifyRoles,
  notifyRolesRowLabel,
  subcategoryOptionsForNotifyRoles,
} from "../../utils/alertRoleBindingNotify.util";
import { getRoleNamesForBindingRow } from "../../utils/alertsNotificationsSettingsHelpers";

const fieldClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary";

const tableCardClass =
  "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

/** Distinct panel for each alert category block (financial, inventory, reputation). */
const alertSettingsSectionClass =
  "rounded-xl border border-gray-200 bg-card-background shadow-sm p-5 md:p-6 space-y-4";

const thClass =
  "text-left font-semibold px-4 lg:px-6 py-3 lg:py-4 text-[10px] md:text-xs 2xl:text-sm text-white";

const thClassCenter =
  "text-center font-semibold px-4 lg:px-6 py-3 lg:py-4 text-[10px] md:text-xs 2xl:text-sm text-white";

interface RoleOption {
  _id: string;
  name: string;
}

const InfoIcon = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className ?? "text-primary/70 shrink-0"}
    aria-hidden
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const DEFAULT_METRIC: Omit<AlertMetricTogglesDto, "run"> = {
  warnInToleranceZone: false,
  alertBeyondTolerance: false,
};

function defaultRunSchedule(): AlertRunScheduleDto {
  return {
    scheduleMode: "interval",
    fixedTimesLocal: ["09:00"],
    interval: { hours: 1, minutes: 0 },
  };
}

function normalizeRun(r?: Partial<AlertRunScheduleDto> | null): AlertRunScheduleDto {
  const base = defaultRunSchedule();
  if (!r) return base;
  const scheduleMode = r.scheduleMode === "fixed_times" ? "fixed_times" : "interval";
  let hours = Math.max(0, Math.min(168, r.interval?.hours ?? base.interval.hours));
  let minutes = Math.max(0, Math.min(59, r.interval?.minutes ?? base.interval.minutes));
  if (scheduleMode === "interval" && hours === 0 && minutes === 0) {
    hours = 1;
    minutes = 0;
  }
  return {
    scheduleMode,
    fixedTimesLocal: r.fixedTimesLocal?.length ? [...r.fixedTimesLocal] : [...base.fixedTimesLocal],
    interval: { hours, minutes },
  };
}

function normalizeMetric(m?: Partial<AlertMetricTogglesDto>): AlertMetricTogglesDto {
  return {
    warnInToleranceZone: m?.warnInToleranceZone ?? DEFAULT_METRIC.warnInToleranceZone,
    alertBeyondTolerance: m?.alertBeyondTolerance ?? DEFAULT_METRIC.alertBeyondTolerance,
    run: normalizeRun(m?.run),
  };
}

const CATEGORY_LABELS: Record<AlertRoleBindingCategory, string> = {
  financial_labor: "Financial & labor",
  inventory_supply_chain: "Inventory & supply chain",
  reputation_hr: "Reputation & HR",
};

const ALERT_ROLE_BINDING_CATEGORIES: AlertRoleBindingCategory[] = [
  "financial_labor",
  "inventory_supply_chain",
  "reputation_hr",
];

const DEFAULT_ALERT_CHANNELS = { inApp: true, email: false, sms: false } as const;

const scheduleModeOptions: DropdownOption[] = [
  { value: "fixed_times", label: "Specific times each day" },
  { value: "interval", label: "Regular interval" },
];

const lowInventoryCadenceOptions: DropdownOption[] = [
  { value: "every_run", label: "Every time the check runs" },
  { value: "once_per_day", label: "Once per day" },
  { value: "once_per_episode", label: "Once per low-inventory episode" },
];

const FINANCIAL_ROWS: Array<{ key: keyof AlertFinancialLaborDto; label: string }> = [
  { key: "sales", label: "Sales goal" },
  { key: "laborCostPct", label: "Labor cost %" },
  { key: "hours", label: "Hours goal" },
  { key: "spmh", label: "SPMH goal" },
  { key: "foodCostPct", label: "Food cost %" },
];

function normalizeSettings(s: AlertNotificationSettingsDto): AlertNotificationSettingsDto {
  const fl = s.financialLabor;
  return {
    ...s,
    financialLabor: {
      sales: normalizeMetric(fl?.sales),
      laborCostPct: normalizeMetric(fl?.laborCostPct),
      hours: normalizeMetric(fl?.hours),
      spmh: normalizeMetric(fl?.spmh),
      foodCostPct: normalizeMetric(fl?.foodCostPct),
    },
    inventorySupplyChain: {
      deliveryOverdueNotReceived: s.inventorySupplyChain?.deliveryOverdueNotReceived ?? false,
      run: normalizeRun(s.inventorySupplyChain?.run),
      lowInventoryEnabled: s.inventorySupplyChain?.lowInventoryEnabled ?? false,
      lowInventoryRun: normalizeRun(s.inventorySupplyChain?.lowInventoryRun),
      lowInventoryCadence:
        s.inventorySupplyChain?.lowInventoryCadence === "every_run" ||
        s.inventorySupplyChain?.lowInventoryCadence === "once_per_day" ||
        s.inventorySupplyChain?.lowInventoryCadence === "once_per_episode"
          ? s.inventorySupplyChain.lowInventoryCadence
          : "once_per_episode",
    },
    reputationHr: {
      trainingOverdue: s.reputationHr?.trainingOverdue ?? false,
      trainingRun: normalizeRun(s.reputationHr?.trainingRun),
      pendingPips: s.reputationHr?.pendingPips ?? false,
      pendingPipsRun: normalizeRun(s.reputationHr?.pendingPipsRun),
    },
    roleBindings: [...(s.roleBindings ?? [])],
  };
}

function ScheduleEditor({
  idPrefix,
  schedule,
  onChange,
}: Readonly<{
  idPrefix: string;
  schedule: AlertRunScheduleDto;
  onChange: (next: AlertRunScheduleDto) => void;
}>) {
  const [hoursDraft, setHoursDraft] = useState<string | null>(null);
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);

  useEffect(() => {
    setHoursDraft(null);
    setMinutesDraft(null);
  }, [schedule.scheduleMode]);

  useEffect(() => {
    setHoursDraft(null);
  }, [schedule.interval.hours]);

  useEffect(() => {
    setMinutesDraft(null);
  }, [schedule.interval.minutes]);

  const hoursDisplay = hoursDraft ?? String(schedule.interval.hours);
  const minutesDisplay = minutesDraft ?? String(schedule.interval.minutes);

  const setSchedule = (patch: Partial<AlertRunScheduleDto>) => {
    onChange({
      ...schedule,
      ...patch,
      interval: patch.interval ? { ...schedule.interval, ...patch.interval } : schedule.interval,
      fixedTimesLocal: patch.fixedTimesLocal ?? schedule.fixedTimesLocal,
    });
  };

  const commitIntervalHours = () => {
    const raw = (hoursDraft ?? String(schedule.interval.hours)).trim();
    setHoursDraft(null);
    const n = Number.parseInt(raw, 10);
    const next = raw === "" || !Number.isFinite(n) ? 0 : Math.max(0, Math.min(168, n));
    if (next !== schedule.interval.hours) {
      setSchedule({
        interval: { ...schedule.interval, hours: next },
      });
    }
  };

  const commitIntervalMinutes = () => {
    const raw = (minutesDraft ?? String(schedule.interval.minutes)).trim();
    setMinutesDraft(null);
    const n = Number.parseInt(raw, 10);
    const next = raw === "" || !Number.isFinite(n) ? 0 : Math.max(0, Math.min(59, n));
    if (next !== schedule.interval.minutes) {
      setSchedule({
        interval: { ...schedule.interval, minutes: next },
      });
    }
  };

  const modeTrigger = useMemo((): ReactNode => {
    const label =
      scheduleModeOptions.find((o) => o.value === schedule.scheduleMode)?.label ??
      schedule.scheduleMode;
    return (
      <span className="text-xs md:text-sm 2xl:text-base text-primary truncate text-left">{label}</span>
    );
  }, [schedule.scheduleMode]);

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
      <p className="text-[10px] md:text-xs font-medium text-secondary">When to run this check</p>
      <div className="max-w-md">
        <p className="block text-[10px] md:text-xs text-secondary mb-1">Schedule mode</p>
        <Dropdown
          options={scheduleModeOptions}
          value={schedule.scheduleMode}
          onChange={(v) =>
            setSchedule({ scheduleMode: v as AlertRunScheduleDto["scheduleMode"] })
          }
          placeholder="Schedule mode"
          aria-label="Schedule mode"
          allowEmpty={false}
          triggerLabel={modeTrigger}
        />
      </div>
      {schedule.scheduleMode === "fixed_times" ? (
        <div className="space-y-2">
          <p className="text-[10px] md:text-xs text-secondary">
            Local times (per location timezone). This check runs when the location&apos;s clock matches.
          </p>
          {schedule.fixedTimesLocal.map((t, i) => (
            <div key={`${idPrefix}-t-${i}`} className="flex gap-2 items-center">
              <input
                id={`${idPrefix}-time-${i}`}
                type="time"
                className={fieldClass + " max-w-[140px]"}
                value={t.length === 5 ? t : "09:00"}
                onChange={(e) => {
                  const next = [...schedule.fixedTimesLocal];
                  next[i] = e.target.value;
                  setSchedule({ fixedTimesLocal: next });
                }}
              />
              <button
                type="button"
                className="p-1 text-negative hover:bg-gray-100 rounded"
                onClick={() => {
                  const next = schedule.fixedTimesLocal.filter((_, j) => j !== i);
                  setSchedule({
                    fixedTimesLocal: next.length ? next : ["09:00"],
                  });
                }}
                aria-label="Remove time"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-button-primary font-medium"
            onClick={() =>
              setSchedule({ fixedTimesLocal: [...schedule.fixedTimesLocal, "12:00"] })
            }
          >
            <FiPlus className="w-4 h-4" />
            Add time
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-[10px] md:text-xs text-secondary mb-1" htmlFor={`${idPrefix}-ih`}>
              Hours
            </label>
            <input
              id={`${idPrefix}-ih`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              className={fieldClass + " w-24"}
              value={hoursDisplay}
              onChange={(e) => setHoursDraft(sanitizeDigitsOnlyInput(e.target.value))}
              onBlur={commitIntervalHours}
            />
          </div>
          <div>
            <label className="block text-[10px] md:text-xs text-secondary mb-1" htmlFor={`${idPrefix}-im`}>
              Minutes
            </label>
            <input
              id={`${idPrefix}-im`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              className={fieldClass + " w-24"}
              value={minutesDisplay}
              onChange={(e) => setMinutesDraft(sanitizeDigitsOnlyInput(e.target.value))}
              onBlur={commitIntervalMinutes}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const AlertsNotificationsSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [settings, setSettings] = useState<AlertNotificationSettingsDto | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<AlertNotificationSettingsDto | null>(
    null,
  );

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalCategory, setRoleModalCategory] = useState<AlertRoleBindingCategory>(
    ALERT_ROLE_BINDING_CATEGORIES[0]!,
  );
  /** Empty string = all alert types in the category (legacy catch-all). */
  const [roleModalSubcategory, setRoleModalSubcategory] = useState("");
  const [roleModalSelected, setRoleModalSelected] = useState<Set<string>>(() => new Set());
  const [roleModalChannels, setRoleModalChannels] = useState<{
    inApp: boolean;
    email: boolean;
    sms: boolean;
  }>(() => ({ ...DEFAULT_ALERT_CHANNELS }));

  const [notifyRolesDeletePending, setNotifyRolesDeletePending] = useState<{
    category: AlertRoleBindingCategory;
    subKey: string;
  } | null>(null);

  const hasUnsavedChanges = useMemo(() => {
    if (loading || !settings || !savedSnapshot) return false;
    return !stableJsonEqual(normalizeSettings(settings), savedSnapshot);
  }, [loading, settings, savedSnapshot]);

  const blocker = useUnsavedChangesNavigationGuard(hasUnsavedChanges);

  const handleDiscard = useCallback(() => {
    if (!savedSnapshot) return;
    setSettings(structuredClone(savedSnapshot));
  }, [savedSnapshot]);

  const categoryDropdownOptions: DropdownOption[] = useMemo(
    () =>
      ALERT_ROLE_BINDING_CATEGORIES.map((cat) => ({
        value: cat,
        label: CATEGORY_LABELS[cat],
      })),
    [],
  );

  const roleRuleRows = useMemo(() => {
    if (!settings) return [];
    const seen = new Map<string, { category: AlertRoleBindingCategory; subKey: string }>();
    for (const b of settings.roleBindings) {
      const subKey = bindingSubKey(b.subcategory);
      const key = `${b.category}|${subKey}`;
      if (!seen.has(key)) seen.set(key, { category: b.category, subKey });
    }
    return [...seen.values()].sort((a, b) =>
      compareNotifyRoleRows(a, b, ALERT_ROLE_BINDING_CATEGORIES),
    );
  }, [settings]);

  const roleModalCategoryTrigger = useMemo((): ReactNode => {
    const label = CATEGORY_LABELS[roleModalCategory];
    return (
      <span className="text-xs md:text-sm 2xl:text-base text-primary truncate text-left">{label}</span>
    );
  }, [roleModalCategory]);

  const subcategoryModalOptions = useMemo(
    () => subcategoryOptionsForNotifyRoles(roleModalCategory),
    [roleModalCategory],
  );

  const roleModalSubcategoryTrigger = useMemo((): ReactNode => {
    const label =
      subcategoryModalOptions.find((o) => o.value === roleModalSubcategory)?.label ??
      "Alert type";
    return (
      <span className="text-xs md:text-sm 2xl:text-base text-primary truncate text-left">{label}</span>
    );
  }, [roleModalSubcategory, subcategoryModalOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, s] = await Promise.all([
        api.get(API_ENDPOINTS.ROLES),
        alertNotificationSettingsService.get(),
      ]);
      const body = rolesRes.data as { data?: { roles: RoleOption[] } };
      setRoles(body.data?.roles ?? []);
      const normalized = normalizeSettings(s);
      setSettings(normalized);
      setSavedSnapshot(normalized);
    } catch {
      toast.error("Failed to load alert notification settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchFinancialMetric = useCallback(
    (key: keyof AlertFinancialLaborDto, patch: Partial<AlertMetricTogglesDto>) => {
      setSettings((prev) => {
        if (!prev) return prev;
        const cur = prev.financialLabor[key];
        const run = patch.run
          ? {
              ...cur.run,
              ...patch.run,
              interval: { ...cur.run.interval, ...patch.run.interval },
              fixedTimesLocal: patch.run.fixedTimesLocal ?? cur.run.fixedTimesLocal,
            }
          : cur.run;
        return {
          ...prev,
          financialLabor: {
            ...prev.financialLabor,
            [key]: { ...cur, ...patch, run },
          },
        };
      });
    },
    [],
  );

  const openRoleModal = useCallback(
    (preselectedCategory: AlertRoleBindingCategory, preselectedSubKey?: string) => {
      if (!settings || roles.length === 0) return;
      const cat = preselectedCategory;
      const sub = preselectedSubKey ?? firstSubcategoryForNotifyRoles(cat);
      setRoleModalCategory(cat);
      setRoleModalSubcategory(sub);
      const bindings = settings.roleBindings.filter((b) => {
        if (b.category !== cat) return false;
        return bindingSubKey(b.subcategory) === sub.trim();
      });
      setRoleModalSelected(new Set(bindings.map((b) => b.roleId)));
      const first = bindings[0];
      setRoleModalChannels(
        first?.channels ? { ...first.channels } : { ...DEFAULT_ALERT_CHANNELS },
      );
      setRoleModalOpen(true);
    },
    [settings, roles.length],
  );

  const handleRoleModalCategoryChange = useCallback(
    (v: string) => {
      const cat = v as AlertRoleBindingCategory;
      setRoleModalCategory(cat);
      const sub = firstSubcategoryForNotifyRoles(cat);
      setRoleModalSubcategory(sub);
      if (!settings) return;
      const bindings = settings.roleBindings.filter((b) => {
        if (b.category !== cat) return false;
        return bindingSubKey(b.subcategory) === sub;
      });
      setRoleModalSelected(new Set(bindings.map((b) => b.roleId)));
      const first = bindings[0];
      setRoleModalChannels(
        first?.channels ? { ...first.channels } : { ...DEFAULT_ALERT_CHANNELS },
      );
    },
    [settings],
  );

  const handleRoleModalSubcategoryChange = useCallback(
    (v: string) => {
      setRoleModalSubcategory(v);
      if (!settings) return;
      const bindings = settings.roleBindings.filter((b) => {
        if (b.category !== roleModalCategory) return false;
        return bindingSubKey(b.subcategory) === v.trim();
      });
      setRoleModalSelected(new Set(bindings.map((b) => b.roleId)));
      const first = bindings[0];
      setRoleModalChannels(
        first?.channels ? { ...first.channels } : { ...DEFAULT_ALERT_CHANNELS },
      );
    },
    [settings, roleModalCategory],
  );

  const closeRoleModal = useCallback(() => setRoleModalOpen(false), []);

  const roleModalSelectAllRef = useRef<HTMLInputElement>(null);
  const allRolesSelectedInModal =
    roles.length > 0 && roles.every((r) => roleModalSelected.has(r._id));
  const someRolesSelectedInModal = roles.some((r) => roleModalSelected.has(r._id));

  useLayoutEffect(() => {
    const el = roleModalSelectAllRef.current;
    if (!el) return;
    el.indeterminate = someRolesSelectedInModal && !allRolesSelectedInModal;
  }, [someRolesSelectedInModal, allRolesSelectedInModal, roleModalOpen]);

  const toggleRoleModalSelectAllRoles = useCallback(() => {
    setRoleModalSelected((prev) => {
      const allIds = roles.map((r) => r._id);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [roles]);

  const toggleRoleModalRole = useCallback((roleId: string, checked: boolean) => {
    setRoleModalSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(roleId);
      else next.delete(roleId);
      return next;
    });
  }, []);

  const applyRoleModal = () => {
    if (!settings || !roleModalOpen) return;
    const subKey = roleModalSubcategory.trim();
    if (!subKey) return;
    const rest = settings.roleBindings.filter((b) => {
      if (b.category !== roleModalCategory) return true;
      return bindingSubKey(b.subcategory) !== subKey;
    });
    const added = [...roleModalSelected].map((roleId) => ({
      category: roleModalCategory,
      subcategory: subKey,
      roleId,
      channels: { ...roleModalChannels },
    }));
    setSettings({ ...settings, roleBindings: [...rest, ...added] });
    closeRoleModal();
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await alertNotificationSettingsService.update(settings);
      const normalized = normalizeSettings(next);
      setSettings(normalized);
      setSavedSnapshot(normalized);
      toast.success("Alert settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className={`p-6 ${hasUnsavedChanges ? "pb-24" : ""}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon
              className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary shrink-0"
              aria-hidden
            />
            Alerts & notifications
          </h2>
        </div>

        <div className="bg-card-background rounded-xl overflow-hidden">
          <div className="h-4 rounded-t-xl bg-primary" aria-hidden />
          <div className="p-6">
            {loading || !settings ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-primary">
                <Spinner size="xl" className="text-button-primary" />
                <span className="text-sm">Loading settings...</span>
              </div>
            ) : (
              <div className="space-y-8">
                <section className={alertSettingsSectionClass} aria-labelledby="alerts-section-financial">
                  <h3
                    id="alerts-section-financial"
                    className="text-sm md:text-base 2xl:text-lg font-semibold text-primary"
                  >
                    Financial & labor (goals)
                  </h3>
                  <p className="text-xs text-tertiary max-w-3xl">
                    Each metric has its own schedule. Warnings use the in-tolerance band; alerts fire beyond tolerance,
                    matching Goal Setting and Command Center.
                  </p>
                  <div className={tableCardClass}>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                        <thead>
                          <tr className="bg-primary text-white">
                            <th className={thClass}>Metric</th>
                            <th className={thClassCenter}>Warn in tolerance</th>
                            <th className={thClassCenter}>Alert beyond tolerance</th>
                          </tr>
                        </thead>
                        <tbody className="text-primary">
                          {FINANCIAL_ROWS.map(({ key, label }, index) => {
                            const t = settings.financialLabor[key];
                            return (
                              <tr key={key} className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                                <td className="px-4 lg:px-6 py-3 align-middle font-medium">{label}</td>
                                <td className="px-4 py-3 align-middle">
                                  <div className="flex justify-center">
                                    <input
                                      type="checkbox"
                                      checked={t.warnInToleranceZone}
                                      onChange={(e) =>
                                        patchFinancialMetric(key, {
                                          warnInToleranceZone: e.target.checked,
                                        })
                                      }
                                      className="rounded border-gray-300"
                                      aria-label={`${label}: warn in tolerance`}
                                    />
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-middle">
                                  <div className="flex justify-center">
                                    <input
                                      type="checkbox"
                                      checked={t.alertBeyondTolerance}
                                      onChange={(e) =>
                                        patchFinancialMetric(key, {
                                          alertBeyondTolerance: e.target.checked,
                                        })
                                      }
                                      className="rounded border-gray-300"
                                      aria-label={`${label}: alert beyond tolerance`}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="md:hidden space-y-3 p-4">
                      {FINANCIAL_ROWS.map(({ key, label }) => {
                        const t = settings.financialLabor[key];
                        return (
                          <div key={key} className="border border-gray-200 rounded-lg p-3 space-y-2">
                            <p className="text-sm font-medium text-primary">{label}</p>
                            <label className="flex items-center gap-2 text-xs text-primary">
                              <input
                                type="checkbox"
                                checked={t.warnInToleranceZone}
                                onChange={(e) =>
                                  patchFinancialMetric(key, {
                                    warnInToleranceZone: e.target.checked,
                                  })
                                }
                                className="rounded border-gray-300"
                              />
                              <span>Warn in tolerance</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs text-primary">
                              <input
                                type="checkbox"
                                checked={t.alertBeyondTolerance}
                                onChange={(e) =>
                                  patchFinancialMetric(key, {
                                    alertBeyondTolerance: e.target.checked,
                                  })
                                }
                                className="rounded border-gray-300"
                              />
                              <span>Alert beyond tolerance</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {FINANCIAL_ROWS.map(({ key, label }) => (
                      <div
                        key={`sched-${key}`}
                        className="min-w-0 rounded-lg border border-gray-200 bg-[#F9FAFB] px-4 py-3"
                      >
                        <p className="text-xs font-semibold text-primary mb-0.5">{label}</p>
                        <ScheduleEditor
                          idPrefix={`fin-${key}`}
                          schedule={settings.financialLabor[key].run}
                          onChange={(run) => patchFinancialMetric(key, { run })}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className={alertSettingsSectionClass} aria-labelledby="alerts-section-inventory">
                  <h3
                    id="alerts-section-inventory"
                    className="text-sm md:text-base 2xl:text-lg font-semibold text-primary"
                  >
                    Inventory & supply chain
                  </h3>
                  <p className="text-xs text-tertiary max-w-3xl">
                    Delivery-overdue and low-inventory checks each use their own schedule.
                  </p>
                  <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-[#F9FAFB]/80">
                    <label className="flex items-center gap-2 text-sm text-primary">
                      <input
                        type="checkbox"
                        checked={settings.inventorySupplyChain.deliveryOverdueNotReceived}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            inventorySupplyChain: {
                              ...settings.inventorySupplyChain,
                              deliveryOverdueNotReceived: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-gray-300"
                      />
                      <span>Notify when delivery date has passed and order is not received</span>
                    </label>
                    <ScheduleEditor
                      idPrefix="inv"
                      schedule={settings.inventorySupplyChain.run}
                      onChange={(run) =>
                        setSettings({
                          ...settings,
                          inventorySupplyChain: { ...settings.inventorySupplyChain, run },
                        })
                      }
                    />
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-[#F9FAFB]/80">
                    <label className="flex items-center gap-2 text-sm text-primary">
                      <input
                        type="checkbox"
                        checked={settings.inventorySupplyChain.lowInventoryEnabled ?? false}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            inventorySupplyChain: {
                              ...settings.inventorySupplyChain,
                              lowInventoryEnabled: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-gray-300"
                      />
                      <span>Notify when inventory is below minimum on hand</span>
                    </label>
                    <div className="max-w-md">
                      <p className="block text-[10px] md:text-xs text-secondary mb-1">
                        <span className="inline-flex items-center gap-1">
                          Alert frequency
                          <Tooltip
                            title="This frequency applies per item, so you control how often you’re alerted for the same item being low."
                            placement="top"
                            arrow
                            enterDelay={200}
                          >
                            <button
                              type="button"
                              className="inline-flex cursor-help p-0 border-0 bg-transparent"
                              aria-label="Low inventory alert frequency info"
                            >
                              <InfoIcon />
                            </button>
                          </Tooltip>
                        </span>
                      </p>
                      <Dropdown
                        options={lowInventoryCadenceOptions}
                        value={settings.inventorySupplyChain.lowInventoryCadence ?? "once_per_episode"}
                        onChange={(v) =>
                          setSettings({
                            ...settings,
                            inventorySupplyChain: {
                              ...settings.inventorySupplyChain,
                              lowInventoryCadence: v as
                                | "every_run"
                                | "once_per_day"
                                | "once_per_episode",
                            },
                          })
                        }
                        placeholder="Alert frequency"
                        aria-label="Low inventory alert frequency"
                        allowEmpty={false}
                      />
                    </div>
                    <ScheduleEditor
                      idPrefix="inv-low"
                      schedule={settings.inventorySupplyChain.lowInventoryRun ?? defaultRunSchedule()}
                      onChange={(lowInventoryRun) =>
                        setSettings({
                          ...settings,
                          inventorySupplyChain: {
                            ...settings.inventorySupplyChain,
                            lowInventoryRun,
                          },
                        })
                      }
                    />
                  </div>
                </section>

                <section className={alertSettingsSectionClass} aria-labelledby="alerts-section-reputation">
                  <h3
                    id="alerts-section-reputation"
                    className="text-sm md:text-base 2xl:text-lg font-semibold text-primary"
                  >
                    Reputation & HR
                  </h3>
                  <p className="text-xs text-tertiary max-w-3xl">
                    Training overdue and pending PIPs each have a separate run schedule.
                  </p>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-[#F9FAFB]/80">
                      <label className="flex items-center gap-2 text-sm text-primary">
                        <input
                          type="checkbox"
                          checked={settings.reputationHr.trainingOverdue}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              reputationHr: {
                                ...settings.reputationHr,
                                trainingOverdue: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-gray-300"
                        />
                        <span>Training overdue (assignments past module end date)</span>
                      </label>
                      <ScheduleEditor
                        idPrefix="hr-train"
                        schedule={settings.reputationHr.trainingRun}
                        onChange={(trainingRun) =>
                          setSettings({
                            ...settings,
                            reputationHr: { ...settings.reputationHr, trainingRun },
                          })
                        }
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-[#F9FAFB]/80">
                      <label className="flex items-center gap-2 text-sm text-primary">
                        <input
                          type="checkbox"
                          checked={settings.reputationHr.pendingPips}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              reputationHr: {
                                ...settings.reputationHr,
                                pendingPips: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-gray-300"
                        />
                        <span>Pending PIPs (disciplinary signatures pending)</span>
                      </label>
                      <ScheduleEditor
                        idPrefix="hr-pip"
                        schedule={settings.reputationHr.pendingPipsRun}
                        onChange={(pendingPipsRun) =>
                          setSettings({
                            ...settings,
                            reputationHr: { ...settings.reputationHr, pendingPipsRun },
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-secondary max-w-3xl">
                    Negative reviews and minimum rating thresholds are not implemented yet. Review milestone
                    notifications still appear in the Command Center from existing review flows when applicable.
                  </p>
                </section>

                <hr className="border-gray-200" />

                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
                      Notify roles by category
                    </h3>
                    <p className="text-xs text-tertiary mt-1 max-w-2xl">
                      For each category, pick an alert type, choose roles, and set channels. Use the save bar at
                      the bottom of the screen to persist changes.
                    </p>
                  </div>
                  {roles.length === 0 ? (
                    <p className="text-sm text-tertiary italic py-2">
                      No roles are available. Create roles in user settings first.
                    </p>
                  ) : null}
                  {ALERT_ROLE_BINDING_CATEGORIES.map((notifyCat) => {
                    const rowsForCat = roleRuleRows.filter((r) => r.category === notifyCat);
                    return (
                      <section
                        key={notifyCat}
                        className={alertSettingsSectionClass}
                        aria-labelledby={`notify-roles-${notifyCat}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <h4
                            id={`notify-roles-${notifyCat}`}
                            className="text-sm md:text-base font-semibold text-primary"
                          >
                            {CATEGORY_LABELS[notifyCat]}
                          </h4>
                          <button
                            type="button"
                            onClick={() => openRoleModal(notifyCat)}
                            disabled={roles.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FiPlus className="w-3.5 h-3.5" aria-hidden />
                            Assign roles
                          </button>
                        </div>
                        {rowsForCat.length === 0 ? (
                          <p className="text-xs text-tertiary italic py-2">
                            No notify rules for this category yet.
                          </p>
                        ) : (
                          <ul className="space-y-3 mt-3">
                            {rowsForCat.map((row) => {
                              const rowKey = `${row.category}|${row.subKey}`;
                              const roleNames = getRoleNamesForBindingRow({
                                roleBindings: settings.roleBindings,
                                roles,
                                category: row.category,
                                subKey: row.subKey,
                                bindingSubKey,
                              });
                              const isLegacyCatchAll = row.subKey === "";
                              return (
                                <li
                                  key={rowKey}
                                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-gray-200 rounded-lg p-4 bg-card-background"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-primary">
                                      {notifyRolesRowLabel(CATEGORY_LABELS[row.category], row.subKey)}
                                    </p>
                                    <p className="text-xs text-tertiary mt-1 break-words">
                                      <span className="font-medium text-secondary">Roles:</span> {roleNames}
                                    </p>
                                    {isLegacyCatchAll ? (
                                      <p className="text-[11px] text-secondary mt-1 max-w-xl">
                                        This rule applies to every alert type in the category. Delete it if you use
                                        per-type rules below, or keep it as a catch-all.
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                                    {isLegacyCatchAll ? null : (
                                      <button
                                        type="button"
                                        onClick={() => openRoleModal(row.category, row.subKey)}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-semibold rounded-lg border border-gray-300 text-primary hover:bg-gray-50 cursor-pointer"
                                      >
                                        <EditIcon className="w-3.5 h-3.5" aria-hidden />
                                        Edit
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setNotifyRolesDeletePending({
                                          category: row.category,
                                          subKey: row.subKey,
                                        })
                                      }
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-semibold rounded-lg border border-red-200 text-red-700 bg-red-50/80 hover:bg-red-100 cursor-pointer"
                                    >
                                      <FiTrash2 className="w-3.5 h-3.5" aria-hidden />
                                      Delete
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {roleModalOpen && (
        <div
          className="fixed inset-0 z-[390] grid place-items-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRoleModal();
          }}
        >
          <div className="relative w-full max-w-lg min-w-0">
            <button
              type="button"
              onClick={closeRoleModal}
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
              aria-labelledby="alert-role-modal-title"
            >
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h2
                  id="alert-role-modal-title"
                  className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
                >
                  Notify roles
                </h2>
              </div>
              <div className="flex-1 min-h-0 px-5 py-4 overflow-y-auto space-y-5 border-x border-gray-200">
                <div>
                  <span
                    id="alert-role-category-label"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Category
                  </span>
                  <Dropdown
                    options={categoryDropdownOptions}
                    value={roleModalCategory}
                    onChange={handleRoleModalCategoryChange}
                    placeholder="Category"
                    aria-label="Alert category"
                    aria-labelledby="alert-role-category-label"
                    className="w-full"
                    allowEmpty={false}
                    triggerLabel={roleModalCategoryTrigger}
                  />
                </div>
                <div>
                  <span
                    id="alert-role-subcategory-label"
                    className="block text-xs md:text-sm font-medium text-secondary mb-1"
                  >
                    Alert type
                  </span>
                  <Dropdown
                    options={subcategoryModalOptions}
                    value={roleModalSubcategory}
                    onChange={handleRoleModalSubcategoryChange}
                    placeholder="Alert type"
                    aria-label="Alert type within category"
                    aria-labelledby="alert-role-subcategory-label"
                    className="w-full"
                    allowEmpty={false}
                    triggerLabel={roleModalSubcategoryTrigger}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-xs md:text-sm font-medium text-secondary">Roles to notify</p>
                    {roles.length > 0 ? (
                      <label
                        htmlFor="alert-role-select-all"
                        className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer shrink-0 font-medium"
                      >
                        <input
                          ref={roleModalSelectAllRef}
                          id="alert-role-select-all"
                          type="checkbox"
                          checked={allRolesSelectedInModal}
                          onChange={toggleRoleModalSelectAllRoles}
                          className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30 h-4 w-4 shrink-0"
                        />
                        <span>Select all</span>
                      </label>
                    ) : null}
                  </div>
                  <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100 bg-[#F9FAFB]">
                    {roles.map((r) => {
                      const id = `alert-role-role-${r._id}`;
                      return (
                        <li key={r._id} className="px-3 py-2.5">
                          <label htmlFor={id} className="flex items-center gap-2.5 text-sm text-primary cursor-pointer">
                            <input
                              id={id}
                              type="checkbox"
                              checked={roleModalSelected.has(r._id)}
                              onChange={(e) => toggleRoleModalRole(r._id, e.target.checked)}
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
                  <p className="text-xs text-tertiary">
                    Applied to every selected role for this category and alert type.
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleModalChannels.inApp}
                        onChange={(e) =>
                          setRoleModalChannels((c) => ({ ...c, inApp: e.target.checked }))
                        }
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      <span>In-app</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleModalChannels.email}
                        onChange={(e) =>
                          setRoleModalChannels((c) => ({ ...c, email: e.target.checked }))
                        }
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      <span>Email</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs md:text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleModalChannels.sms}
                        onChange={(e) =>
                          setRoleModalChannels((c) => ({ ...c, sms: e.target.checked }))
                        }
                        className="rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                      />
                      <span>SMS</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeRoleModal}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyRoleModal}
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

      <UnsavedChangesBar
        visible={hasUnsavedChanges}
        onDiscard={handleDiscard}
        onSave={() => void save()}
        saving={saving}
        saveLabel={saving ? "Saving..." : "Save Settings"}
      />

      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        title="Unsaved changes"
        message="Unsaved alert settings will be lost if you leave."
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />

      <ConfirmDialog
        isOpen={notifyRolesDeletePending != null}
        onClose={() => setNotifyRolesDeletePending(null)}
        title="Remove notify roles"
        message={
          notifyRolesDeletePending
            ? `Remove notify-roles for “${notifyRolesRowLabel(
                CATEGORY_LABELS[notifyRolesDeletePending.category],
                notifyRolesDeletePending.subKey,
              )}”? Those roles will stop receiving these alerts after you save settings.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          const p = notifyRolesDeletePending;
          if (!p) return;
          const shouldCloseAssignModal =
            roleModalOpen &&
            roleModalCategory === p.category &&
            bindingSubKey(roleModalSubcategory) === p.subKey;
          setSettings((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              roleBindings: prev.roleBindings.filter((b) => {
                if (b.category !== p.category) return true;
                return bindingSubKey(b.subcategory) !== p.subKey;
              }),
            };
          });
          if (shouldCloseAssignModal) closeRoleModal();
          setNotifyRolesDeletePending(null);
        }}
      />
    </Layout>
  );
};

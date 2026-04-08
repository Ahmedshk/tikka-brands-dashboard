import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { FiPlus, FiX } from "react-icons/fi";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
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

const fieldClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary";

const tableCardClass =
  "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

const thClass =
  "text-left font-semibold px-4 lg:px-6 py-3 lg:py-4 text-[10px] md:text-xs 2xl:text-sm text-white";

interface RoleOption {
  _id: string;
  name: string;
}

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

const scheduleModeOptions: DropdownOption[] = [
  { value: "fixed_times", label: "Specific times each day" },
  { value: "interval", label: "Regular interval" },
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
}: {
  idPrefix: string;
  schedule: AlertRunScheduleDto;
  onChange: (next: AlertRunScheduleDto) => void;
}) {
  const modeTrigger = useMemo((): ReactNode => {
    const label =
      scheduleModeOptions.find((o) => o.value === schedule.scheduleMode)?.label ??
      schedule.scheduleMode;
    return (
      <span className="text-xs md:text-sm 2xl:text-base text-primary truncate text-left">{label}</span>
    );
  }, [schedule.scheduleMode]);

  const setSchedule = (patch: Partial<AlertRunScheduleDto>) => {
    onChange({
      ...schedule,
      ...patch,
      interval: patch.interval != null ? { ...schedule.interval, ...patch.interval } : schedule.interval,
      fixedTimesLocal: patch.fixedTimesLocal ?? schedule.fixedTimesLocal,
    });
  };

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
              type="number"
              min={0}
              max={168}
              className={fieldClass + " w-24"}
              value={schedule.interval.hours}
              onChange={(e) =>
                setSchedule({
                  interval: {
                    ...schedule.interval,
                    hours: Math.max(0, Math.min(168, Number(e.target.value) || 0)),
                  },
                })
              }
            />
          </div>
          <div>
            <label className="block text-[10px] md:text-xs text-secondary mb-1" htmlFor={`${idPrefix}-im`}>
              Minutes
            </label>
            <input
              id={`${idPrefix}-im`}
              type="number"
              min={0}
              max={59}
              className={fieldClass + " w-24"}
              value={schedule.interval.minutes}
              onChange={(e) =>
                setSchedule({
                  interval: {
                    ...schedule.interval,
                    minutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                  },
                })
              }
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

  const [roleModalCategory, setRoleModalCategory] = useState<AlertRoleBindingCategory | null>(null);
  const [roleModalSelected, setRoleModalSelected] = useState<Set<string>>(() => new Set());
  const [roleModalChannels, setRoleModalChannels] = useState({
    inApp: true,
    email: false,
    sms: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, s] = await Promise.all([
        api.get(API_ENDPOINTS.ROLES),
        alertNotificationSettingsService.get(),
      ]);
      const body = rolesRes.data as { data?: { roles: RoleOption[] } };
      setRoles(body.data?.roles ?? []);
      setSettings(normalizeSettings(s));
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
        const run =
          patch.run != null
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

  const openRoleModal = (category: AlertRoleBindingCategory) => {
    if (!settings) return;
    const bindings = settings.roleBindings.filter((b) => b.category === category);
    setRoleModalSelected(new Set(bindings.map((b) => b.roleId)));
    const first = bindings[0];
    setRoleModalChannels(first?.channels ?? { inApp: true, email: false, sms: false });
    setRoleModalCategory(category);
  };

  const closeRoleModal = () => setRoleModalCategory(null);

  const applyRoleModal = () => {
    if (!settings || !roleModalCategory) return;
    const rest = settings.roleBindings.filter((b) => b.category !== roleModalCategory);
    const added = [...roleModalSelected].map((roleId) => ({
      category: roleModalCategory,
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
      setSettings(normalizeSettings(next));
      toast.success("Alert settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
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
                <div>
                  <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary mb-1">
                    Financial & labor (goals)
                  </h3>
                  <p className="text-xs text-tertiary max-w-3xl mb-4">
                    Each metric has its own schedule. Warnings use the in-tolerance band; alerts fire beyond tolerance,
                    matching Goal Setting and Command Center.
                  </p>
                  <div className={tableCardClass}>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                        <thead>
                          <tr className="bg-primary text-white">
                            <th className={thClass}>Metric</th>
                            <th className={`${thClass} text-center`}>Warn in tolerance</th>
                            <th className={`${thClass} text-center`}>Alert beyond tolerance</th>
                          </tr>
                        </thead>
                        <tbody className="text-primary">
                          {FINANCIAL_ROWS.map(({ key, label }, index) => {
                            const t = settings.financialLabor[key];
                            return (
                              <tr key={key} className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                                <td className="px-4 lg:px-6 py-3 align-top font-medium">{label}</td>
                                <td className="px-4 py-3 text-center align-top">
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
                                </td>
                                <td className="px-4 py-3 text-center align-top">
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
                              Warn in tolerance
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
                              Alert beyond tolerance
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    {FINANCIAL_ROWS.map(({ key, label }) => (
                      <div
                        key={`sched-${key}`}
                        className="rounded-lg border border-gray-200 bg-[#F9FAFB] px-4 py-3"
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
                </div>

                <div>
                  <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary mb-1">
                    Inventory & supply chain
                  </h3>
                  <p className="text-xs text-tertiary mb-3 max-w-3xl">
                    Delivery-overdue checks use their own schedule.
                  </p>
                  <div className="rounded-lg border border-gray-200 p-4 space-y-3">
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
                      Notify when delivery date has passed and order is not received
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
                </div>

                <div>
                  <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary mb-1">
                    Reputation & HR
                  </h3>
                  <p className="text-xs text-tertiary mb-3 max-w-3xl">
                    Training overdue and pending PIPs each have a separate run schedule.
                  </p>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
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
                        Training overdue (assignments past module end date)
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
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
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
                        Pending PIPs (disciplinary signatures pending)
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
                  <p className="text-xs text-secondary mt-4 max-w-3xl">
                    Negative reviews and minimum rating thresholds are not implemented yet. Review milestone
                    notifications still appear in the Command Center from existing review flows when applicable.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary mb-3">
                    Notify roles by category
                  </h3>
                  <div className={tableCardClass}>
                    <div className="divide-y divide-gray-200">
                      {(Object.keys(CATEGORY_LABELS) as AlertRoleBindingCategory[]).map((cat) => {
                        const count = settings.roleBindings.filter((b) => b.category === cat).length;
                        return (
                          <div
                            key={cat}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                          >
                            <span className="text-sm text-primary">
                              {CATEGORY_LABELS[cat]}
                              <span className="text-secondary ml-2">
                                ({count} role{count === 1 ? "" : "s"})
                              </span>
                            </span>
                            <button
                              type="button"
                              className="text-xs md:text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-primary hover:bg-gray-50"
                              onClick={() => openRoleModal(cat)}
                            >
                              Assign roles
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {roleModalCategory != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className="bg-card-background rounded-xl shadow-lg border border-gray-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-role-modal-title"
          >
            <h3 id="alert-role-modal-title" className="text-sm font-semibold text-primary mb-3">
              Roles — {CATEGORY_LABELS[roleModalCategory]}
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {roles.map((r) => (
                <label key={r._id} className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="checkbox"
                    checked={roleModalSelected.has(r._id)}
                    onChange={(e) => {
                      setRoleModalSelected((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(r._id);
                        else n.delete(r._id);
                        return n;
                      });
                    }}
                    className="rounded border-gray-300"
                  />
                  {r.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-secondary mb-2">Channels</p>
            <div className="flex flex-wrap gap-4 mb-4">
              {(["inApp", "email", "sms"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-primary capitalize">
                  <input
                    type="checkbox"
                    checked={roleModalChannels[k]}
                    onChange={(e) =>
                      setRoleModalChannels((c) => ({ ...c, [k]: e.target.checked }))
                    }
                    className="rounded border-gray-300"
                  />
                  {k === "inApp" ? "In-app" : k}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300"
                onClick={closeRoleModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-lg bg-button-primary text-white"
                onClick={applyRoleModal}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

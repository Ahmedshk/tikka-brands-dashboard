import mongoose from "mongoose";
import { AlertNotificationSettingsModel } from "../models/alertNotificationSettings.model.js";
import {
  DEFAULT_ALERT_FINANCIAL_LABOR,
  DEFAULT_ALERT_METRIC_TOGGLES,
  DEFAULT_ALERT_NOTIFICATION_SETTINGS,
  DEFAULT_ALERT_RUN_SCHEDULE,
  type AlertEntityCadence,
  type IAlertFinancialLaborToggles,
  type IAlertMetricToggles,
  type IAlertNotificationSettings,
  type IAlertRoleBinding,
  type IAlertRunSchedule,
} from "../types/alertNotification.types.js";
import { normalizeRoleBindingChannels } from "../utils/calendarRoleBindingChannels.util.js";
import { normalizeAlertEntityCadence } from "../utils/alertEntityCadence.util.js";

type LegacyDocFields = {
  scheduleMode?: string;
  fixedTimesLocal?: string[];
  interval?: { hours: number; minutes: number };
};

function legacyGlobalSchedule(legacy: LegacyDocFields): IAlertRunSchedule | null {
  if (legacy.scheduleMode !== "fixed_times" && legacy.scheduleMode !== "interval") {
    return null;
  }
  return {
    scheduleMode: legacy.scheduleMode,
    fixedTimesLocal:
      legacy.fixedTimesLocal?.length ? [...legacy.fixedTimesLocal] : [...DEFAULT_ALERT_RUN_SCHEDULE.fixedTimesLocal],
    interval: {
      hours: legacy.interval?.hours ?? DEFAULT_ALERT_RUN_SCHEDULE.interval.hours,
      minutes: legacy.interval?.minutes ?? DEFAULT_ALERT_RUN_SCHEDULE.interval.minutes,
    },
  };
}

function normalizeRunSchedule(
  raw: Partial<IAlertRunSchedule> | undefined,
  fallback: IAlertRunSchedule,
): IAlertRunSchedule {
  const mode =
    raw?.scheduleMode === "fixed_times" || raw?.scheduleMode === "interval"
      ? raw.scheduleMode
      : fallback.scheduleMode;
  const fixed =
    raw?.fixedTimesLocal != null && raw.fixedTimesLocal.length > 0
      ? [...raw.fixedTimesLocal]
      : [...fallback.fixedTimesLocal];
  return {
    scheduleMode: mode,
    fixedTimesLocal: fixed,
    interval: {
      hours: Math.max(0, Math.min(168, raw?.interval?.hours ?? fallback.interval.hours)),
      minutes: Math.max(0, Math.min(59, raw?.interval?.minutes ?? fallback.interval.minutes)),
    },
  };
}

function normalizeLowRatingReviewsRunSchedule(
  raw: Partial<IAlertRunSchedule> | undefined,
  fallback: IAlertRunSchedule,
): IAlertRunSchedule {
  const normalized = normalizeRunSchedule(raw, fallback);
  if (normalized.scheduleMode === "interval") {
    return {
      ...normalized,
      interval: { hours: normalized.interval.hours, minutes: 0 },
    };
  }
  return normalized;
}

function mergeRunSchedule(base: IAlertRunSchedule, patch?: Partial<IAlertRunSchedule>): IAlertRunSchedule {
  if (!patch) {
    return {
      ...base,
      interval: { ...base.interval },
      fixedTimesLocal: [...base.fixedTimesLocal],
    };
  }
  return normalizeRunSchedule(
    {
      ...base,
      ...patch,
      interval: patch.interval == null ? base.interval : { ...base.interval, ...patch.interval },
      fixedTimesLocal: patch.fixedTimesLocal ?? base.fixedTimesLocal,
    },
    base,
  );
}

function metricFromDoc(
  raw: Partial<IAlertMetricToggles> | undefined,
  defaults: IAlertMetricToggles,
  legacyRun: IAlertRunSchedule | null,
): IAlertMetricToggles {
  const baseWarn = {
    warnInToleranceZone: raw?.warnInToleranceZone ?? defaults.warnInToleranceZone,
    alertBeyondTolerance: raw?.alertBeyondTolerance ?? defaults.alertBeyondTolerance,
  };
  const runCandidate = raw?.run;
  const hasOwnRun =
    runCandidate != null &&
    typeof runCandidate === "object" &&
    (runCandidate.scheduleMode === "fixed_times" || runCandidate.scheduleMode === "interval");
  const runFallback = legacyRun ?? defaults.run;
  const run = hasOwnRun
    ? normalizeRunSchedule(runCandidate, runFallback)
    : normalizeRunSchedule(undefined, runFallback);
  return { ...baseWarn, run };
}

function mergeMetric(
  doc: IAlertMetricToggles,
  patch?: Partial<IAlertMetricToggles>,
): IAlertMetricToggles {
  if (!patch) {
    return {
      ...doc,
      run: {
        ...doc.run,
        interval: { ...doc.run.interval },
        fixedTimesLocal: [...doc.run.fixedTimesLocal],
      },
    };
  }
  return {
    warnInToleranceZone: patch.warnInToleranceZone ?? doc.warnInToleranceZone,
    alertBeyondTolerance: patch.alertBeyondTolerance ?? doc.alertBeyondTolerance,
    run: mergeRunSchedule(doc.run, patch.run),
  };
}

const FINANCIAL_KEYS = ["sales", "laborCostPct", "hours", "spmh", "foodCostPct"] as const;

function financialFromDoc(
  raw: Partial<IAlertFinancialLaborToggles> | undefined,
  legacyRun: IAlertRunSchedule | null,
): IAlertFinancialLaborToggles {
  const out = { ...DEFAULT_ALERT_FINANCIAL_LABOR };
  for (const k of FINANCIAL_KEYS) {
    out[k] = metricFromDoc(raw?.[k], DEFAULT_ALERT_METRIC_TOGGLES, legacyRun);
  }
  return out;
}

function mergeFinancialPatch(
  current: IAlertFinancialLaborToggles,
  patch: Partial<IAlertFinancialLaborToggles>,
): IAlertFinancialLaborToggles {
  const out = { ...current };
  for (const k of FINANCIAL_KEYS) {
    if (patch[k] !== undefined) {
      out[k] = mergeMetric(current[k], patch[k]);
    }
  }
  return out;
}

function toPlain(doc: {
  _id: { toString: () => string };
  scheduleMode?: string;
  fixedTimesLocal?: string[];
  interval?: { hours: number; minutes: number };
  financialLabor?: Partial<IAlertFinancialLaborToggles> | IAlertFinancialLaborToggles;
  inventorySupplyChain: {
    deliveryOverdueNotReceived?: boolean;
    run?: Partial<IAlertRunSchedule>;
    lowInventoryEnabled?: boolean;
    lowInventoryRun?: Partial<IAlertRunSchedule>;
    deliveryOverdueCadence?: AlertEntityCadence;
    lowInventoryCadence?: AlertEntityCadence;
  };
  reputationHr: {
    trainingOverdue?: boolean;
    trainingRun?: Partial<IAlertRunSchedule>;
    trainingOverdueCadence?: AlertEntityCadence;
    pendingPips?: boolean;
    pendingPipsRun?: Partial<IAlertRunSchedule>;
    pendingPipsCadence?: AlertEntityCadence;
    lowRatingReviews?: boolean;
    lowRatingReviewsRun?: Partial<IAlertRunSchedule>;
    lowRatingThreshold?: number;
  };
  roleBindings: Array<{
    category: string;
    subcategory?: string;
    roleId: unknown;
    channels: { inApp: boolean; email: boolean; sms: boolean };
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}): IAlertNotificationSettings {
  const legacy = legacyGlobalSchedule(doc);

  const financialLabor = financialFromDoc(doc.financialLabor, legacy);

  const invRun = normalizeRunSchedule(doc.inventorySupplyChain?.run, legacy ?? DEFAULT_ALERT_RUN_SCHEDULE);
  const lowInvRun = normalizeRunSchedule(
    (doc.inventorySupplyChain as unknown as { lowInventoryRun?: Partial<IAlertRunSchedule> })?.lowInventoryRun,
    legacy ?? DEFAULT_ALERT_RUN_SCHEDULE,
  );
  const lowInvEnabled =
    (doc.inventorySupplyChain as unknown as { lowInventoryEnabled?: boolean })?.lowInventoryEnabled ??
    false;
  const invSc = doc.inventorySupplyChain as unknown as {
    deliveryOverdueCadence?: unknown;
    lowInventoryCadence?: unknown;
  };
  const deliveryOverdueCadence = normalizeAlertEntityCadence(invSc?.deliveryOverdueCadence);
  const lowInvCadence = normalizeAlertEntityCadence(invSc?.lowInventoryCadence);

  const rep = doc.reputationHr ?? {};
  const repAny = rep as unknown as {
    trainingOverdueCadence?: unknown;
    pendingPipsCadence?: unknown;
  };
  const trainingOverdueCadence = normalizeAlertEntityCadence(repAny.trainingOverdueCadence);
  const pendingPipsCadence = normalizeAlertEntityCadence(repAny.pendingPipsCadence);
  const trainingRun = normalizeRunSchedule(rep.trainingRun, legacy ?? DEFAULT_ALERT_RUN_SCHEDULE);
  const pendingPipsRun = normalizeRunSchedule(rep.pendingPipsRun, legacy ?? DEFAULT_ALERT_RUN_SCHEDULE);
  const lowRatingReviewsRun = normalizeLowRatingReviewsRunSchedule(
    rep.lowRatingReviewsRun,
    legacy ?? DEFAULT_ALERT_RUN_SCHEDULE,
  );
  const lowRatingThresholdRaw = rep.lowRatingThreshold;
  const lowRatingThreshold =
    typeof lowRatingThresholdRaw === "number" &&
    lowRatingThresholdRaw >= 1 &&
    lowRatingThresholdRaw <= 5
      ? lowRatingThresholdRaw
      : 3;

  const out: IAlertNotificationSettings = {
    _id: doc._id.toString(),
    financialLabor,
    inventorySupplyChain: {
      deliveryOverdueNotReceived: doc.inventorySupplyChain?.deliveryOverdueNotReceived ?? false,
      run: invRun,
      deliveryOverdueCadence,
      lowInventoryEnabled: lowInvEnabled,
      lowInventoryRun: lowInvRun,
      lowInventoryCadence: lowInvCadence,
    },
    reputationHr: {
      trainingOverdue: rep.trainingOverdue ?? false,
      trainingRun,
      trainingOverdueCadence,
      pendingPips: rep.pendingPips ?? false,
      pendingPipsRun,
      pendingPipsCadence,
      lowRatingReviews: rep.lowRatingReviews ?? false,
      lowRatingReviewsRun,
      lowRatingThreshold,
    },
    roleBindings: (doc.roleBindings ?? []).map((b) => {
      const sub =
        typeof b.subcategory === "string" && b.subcategory.trim() !== ""
          ? (b.subcategory.trim() as IAlertRoleBinding["subcategory"])
          : undefined;
      return {
        category: b.category as IAlertRoleBinding["category"],
        ...(sub ? { subcategory: sub } : {}),
        roleId:
          typeof b.roleId === "object" && b.roleId && "toString" in b.roleId
            ? (b.roleId as { toString: () => string }).toString()
            : String(b.roleId),
        channels: normalizeRoleBindingChannels(b.channels),
      };
    }),
  };
  if (doc.createdAt) out.createdAt = doc.createdAt;
  if (doc.updatedAt) out.updatedAt = doc.updatedAt;
  return out;
}

export class AlertNotificationSettingsService {
  async get(): Promise<IAlertNotificationSettings> {
    let doc = await AlertNotificationSettingsModel.findOne();
    doc ??= await AlertNotificationSettingsModel.create({
      ...DEFAULT_ALERT_NOTIFICATION_SETTINGS,
      financialLabor: structuredClone(DEFAULT_ALERT_FINANCIAL_LABOR),
    });
    return toPlain(doc.toObject() as Parameters<typeof toPlain>[0]);
  }

  async upsert(data: {
    financialLabor?: Partial<IAlertFinancialLaborToggles>;
    inventorySupplyChain?: Partial<{
      deliveryOverdueNotReceived: boolean;
      run: Partial<IAlertRunSchedule>;
      lowInventoryEnabled: boolean;
      lowInventoryRun: Partial<IAlertRunSchedule>;
      deliveryOverdueCadence: AlertEntityCadence;
      lowInventoryCadence: AlertEntityCadence;
    }>;
    reputationHr?: Partial<{
      trainingOverdue: boolean;
      trainingRun: Partial<IAlertRunSchedule>;
      trainingOverdueCadence: AlertEntityCadence;
      pendingPips: boolean;
      pendingPipsRun: Partial<IAlertRunSchedule>;
      pendingPipsCadence: AlertEntityCadence;
      lowRatingReviews: boolean;
      lowRatingReviewsRun: Partial<IAlertRunSchedule>;
      lowRatingThreshold: number;
    }>;
    roleBindings?: Array<{
      category: IAlertRoleBinding["category"];
      subcategory?: IAlertRoleBinding["subcategory"];
      roleId: string;
      channels: { inApp: boolean; email: boolean; sms: boolean };
    }>;
  }): Promise<IAlertNotificationSettings> {
    let doc = await AlertNotificationSettingsModel.findOne();
    doc ??= await AlertNotificationSettingsModel.create({
      ...DEFAULT_ALERT_NOTIFICATION_SETTINGS,
      financialLabor: structuredClone(DEFAULT_ALERT_FINANCIAL_LABOR),
    });

    const plainBefore = toPlain(doc.toObject() as Parameters<typeof toPlain>[0]);

    if (data.financialLabor !== undefined) {
      doc.financialLabor = mergeFinancialPatch(plainBefore.financialLabor, data.financialLabor) as never;
    }
    if (data.inventorySupplyChain !== undefined) {
      const prevAny = doc.inventorySupplyChain as unknown as {
        lowInventoryEnabled?: boolean;
        lowInventoryRun?: Partial<IAlertRunSchedule>;
        deliveryOverdueCadence?: unknown;
        lowInventoryCadence?: unknown;
      };
      doc.inventorySupplyChain = {
        deliveryOverdueNotReceived:
          data.inventorySupplyChain.deliveryOverdueNotReceived ??
          doc.inventorySupplyChain?.deliveryOverdueNotReceived ??
          false,
        run: mergeRunSchedule(
          plainBefore.inventorySupplyChain.run,
          data.inventorySupplyChain.run,
        ) as never,
        deliveryOverdueCadence:
          data.inventorySupplyChain.deliveryOverdueCadence ??
          normalizeAlertEntityCadence(prevAny.deliveryOverdueCadence),
        lowInventoryEnabled:
          data.inventorySupplyChain.lowInventoryEnabled ?? prevAny.lowInventoryEnabled ?? false,
        lowInventoryRun: mergeRunSchedule(
          plainBefore.inventorySupplyChain.lowInventoryRun,
          data.inventorySupplyChain.lowInventoryRun,
        ) as never,
        lowInventoryCadence:
          data.inventorySupplyChain.lowInventoryCadence ??
          normalizeAlertEntityCadence(prevAny.lowInventoryCadence),
      };
    }
    if (data.reputationHr !== undefined) {
      const prevRep = doc.reputationHr as unknown as {
        trainingOverdueCadence?: unknown;
        pendingPipsCadence?: unknown;
      };
      doc.reputationHr = {
        trainingOverdue:
          data.reputationHr.trainingOverdue ?? doc.reputationHr?.trainingOverdue ?? false,
        trainingRun: mergeRunSchedule(
          plainBefore.reputationHr.trainingRun,
          data.reputationHr.trainingRun,
        ) as never,
        trainingOverdueCadence:
          data.reputationHr.trainingOverdueCadence ??
          normalizeAlertEntityCadence(prevRep.trainingOverdueCadence),
        pendingPips: data.reputationHr.pendingPips ?? doc.reputationHr?.pendingPips ?? false,
        pendingPipsRun: mergeRunSchedule(
          plainBefore.reputationHr.pendingPipsRun,
          data.reputationHr.pendingPipsRun,
        ) as never,
        pendingPipsCadence:
          data.reputationHr.pendingPipsCadence ??
          normalizeAlertEntityCadence(prevRep.pendingPipsCadence),
        lowRatingReviews:
          data.reputationHr.lowRatingReviews ?? doc.reputationHr?.lowRatingReviews ?? false,
        lowRatingReviewsRun: (() => {
          const merged = mergeRunSchedule(
            plainBefore.reputationHr.lowRatingReviewsRun,
            data.reputationHr.lowRatingReviewsRun,
          );
          return normalizeLowRatingReviewsRunSchedule(merged, merged) as never;
        })(),
        lowRatingThreshold:
          data.reputationHr.lowRatingThreshold ??
          doc.reputationHr?.lowRatingThreshold ??
          3,
      };
    }
    if (data.roleBindings !== undefined) {
      doc.roleBindings = data.roleBindings.map((b) => {
        const sub =
          typeof b.subcategory === "string" && b.subcategory.trim() !== ""
            ? b.subcategory.trim()
            : undefined;
        return {
          category: b.category,
          ...(sub ? { subcategory: sub } : {}),
          roleId: new mongoose.Types.ObjectId(b.roleId),
          channels: normalizeRoleBindingChannels(b.channels),
        };
      }) as typeof doc.roleBindings;
    }

    doc.set("scheduleMode", undefined);
    doc.set("fixedTimesLocal", undefined);
    doc.set("interval", undefined);

    await doc.save();
    return toPlain(doc.toObject() as Parameters<typeof toPlain>[0]);
  }
}

/** Ensure nested metric objects exist (legacy or partial docs). */
export function normalizeFinancialLabor(
  raw: Partial<IAlertFinancialLaborToggles> | undefined,
): IAlertFinancialLaborToggles {
  return financialFromDoc(raw, null);
}

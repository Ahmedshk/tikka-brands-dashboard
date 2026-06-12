import type { Types } from "mongoose";

export type AlertScheduleMode = "fixed_times" | "interval";

export type AlertRoleBindingCategory =
  | "financial_labor"
  | "inventory_supply_chain"
  | "reputation_hr";

export interface IAlertChannelPrefs {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export interface IAlertInterval {
  hours: number;
  minutes: number;
}

/** When to run checks for a single alert rule (per metric / inventory / HR item). */
export interface IAlertRunSchedule {
  scheduleMode: AlertScheduleMode;
  /** Local HH:mm strings; matched in each location timezone when scheduleMode is fixed_times. */
  fixedTimesLocal: string[];
  interval: IAlertInterval;
}

/** Per-metric toggles: warning = in tolerance zone; alert = beyond tolerance. */
export interface IAlertMetricToggles {
  warnInToleranceZone: boolean;
  alertBeyondTolerance: boolean;
  run: IAlertRunSchedule;
}

export interface IAlertFinancialLaborToggles {
  sales: IAlertMetricToggles;
  laborCostPct: IAlertMetricToggles;
  hours: IAlertMetricToggles;
  spmh: IAlertMetricToggles;
  foodCostPct: IAlertMetricToggles;
}

export type AlertEntityCadence = "every_run" | "once_per_day" | "once_per_episode";

/** @deprecated Use AlertEntityCadence */
export type LowInventoryCadence = AlertEntityCadence;

export interface IAlertInventorySupplyChainToggles {
  deliveryOverdueNotReceived: boolean;
  run: IAlertRunSchedule;
  deliveryOverdueCadence: AlertEntityCadence;
  lowInventoryEnabled: boolean;
  lowInventoryRun: IAlertRunSchedule;
  lowInventoryCadence: AlertEntityCadence;
}

export interface IAlertReputationHrToggles {
  trainingOverdue: boolean;
  trainingRun: IAlertRunSchedule;
  trainingOverdueCadence: AlertEntityCadence;
  pendingPips: boolean;
  pendingPipsRun: IAlertRunSchedule;
  pendingPipsCadence: AlertEntityCadence;
  lowRatingReviews: boolean;
  lowRatingReviewsRun: IAlertRunSchedule;
  /** Alert when starRatingNumeric is strictly less than this threshold (1–5). */
  lowRatingThreshold: number;
}

/**
 * Optional scope within a category. Omitted or empty = all alert types in that category (legacy).
 * @see ALERT_ROLE_SUBCATEGORIES in alertRoleBindingSubcategory.util.ts
 */
export type IAlertRoleBindingSubcategory =
  | keyof IAlertFinancialLaborToggles
  | "delivery_overdue"
  | "low_inventory"
  | "training_overdue"
  | "pending_pips"
  | "low_rating_reviews";

export interface IAlertRoleBinding {
  category: AlertRoleBindingCategory;
  subcategory?: IAlertRoleBindingSubcategory;
  roleId: Types.ObjectId | string;
  channels: IAlertChannelPrefs;
}

export interface IAlertNotificationSettings {
  _id?: string;
  financialLabor: IAlertFinancialLaborToggles;
  inventorySupplyChain: IAlertInventorySupplyChainToggles;
  reputationHr: IAlertReputationHrToggles;
  roleBindings: IAlertRoleBinding[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const DEFAULT_ALERT_RUN_SCHEDULE: IAlertRunSchedule = {
  scheduleMode: "interval",
  fixedTimesLocal: ["09:00"],
  interval: { hours: 1, minutes: 0 },
};

export const DEFAULT_ALERT_METRIC_TOGGLES: IAlertMetricToggles = {
  warnInToleranceZone: false,
  alertBeyondTolerance: false,
  run: { ...DEFAULT_ALERT_RUN_SCHEDULE },
};

export const DEFAULT_ALERT_FINANCIAL_LABOR: IAlertFinancialLaborToggles = {
  sales: { ...DEFAULT_ALERT_METRIC_TOGGLES },
  laborCostPct: { ...DEFAULT_ALERT_METRIC_TOGGLES },
  hours: { ...DEFAULT_ALERT_METRIC_TOGGLES },
  spmh: { ...DEFAULT_ALERT_METRIC_TOGGLES },
  foodCostPct: { ...DEFAULT_ALERT_METRIC_TOGGLES },
};

export const DEFAULT_ALERT_NOTIFICATION_SETTINGS: Omit<
  IAlertNotificationSettings,
  "_id" | "createdAt" | "updatedAt"
> = {
  financialLabor: DEFAULT_ALERT_FINANCIAL_LABOR,
  inventorySupplyChain: {
    deliveryOverdueNotReceived: false,
    run: { ...DEFAULT_ALERT_RUN_SCHEDULE },
    deliveryOverdueCadence: "once_per_episode",
    lowInventoryEnabled: false,
    lowInventoryRun: { ...DEFAULT_ALERT_RUN_SCHEDULE },
    lowInventoryCadence: "once_per_episode",
  },
  reputationHr: {
    trainingOverdue: false,
    trainingRun: { ...DEFAULT_ALERT_RUN_SCHEDULE },
    trainingOverdueCadence: "once_per_episode",
    pendingPips: false,
    pendingPipsRun: { ...DEFAULT_ALERT_RUN_SCHEDULE },
    pendingPipsCadence: "once_per_episode",
    lowRatingReviews: false,
    lowRatingReviewsRun: { ...DEFAULT_ALERT_RUN_SCHEDULE },
    lowRatingThreshold: 3,
  },
  roleBindings: [],
};

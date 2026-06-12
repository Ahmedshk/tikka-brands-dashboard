export type AlertScheduleMode = "fixed_times" | "interval";

export type AlertRoleBindingCategory =
  | "financial_labor"
  | "inventory_supply_chain"
  | "reputation_hr";

export interface AlertChannelPrefsDto {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export interface AlertRunScheduleDto {
  scheduleMode: AlertScheduleMode;
  fixedTimesLocal: string[];
  interval: { hours: number; minutes: number };
}

export interface AlertMetricTogglesDto {
  warnInToleranceZone: boolean;
  alertBeyondTolerance: boolean;
  run: AlertRunScheduleDto;
}

export interface AlertFinancialLaborDto {
  sales: AlertMetricTogglesDto;
  laborCostPct: AlertMetricTogglesDto;
  hours: AlertMetricTogglesDto;
  spmh: AlertMetricTogglesDto;
  foodCostPct: AlertMetricTogglesDto;
}

export type AlertEntityCadenceDto = "every_run" | "once_per_day" | "once_per_episode";

export interface AlertNotificationSettingsDto {
  _id?: string;
  financialLabor: AlertFinancialLaborDto;
  inventorySupplyChain: {
    deliveryOverdueNotReceived: boolean;
    run: AlertRunScheduleDto;
    deliveryOverdueCadence?: AlertEntityCadenceDto;
    lowInventoryEnabled?: boolean;
    lowInventoryRun?: AlertRunScheduleDto;
    lowInventoryCadence?: AlertEntityCadenceDto;
  };
  reputationHr: {
    trainingOverdue: boolean;
    trainingRun: AlertRunScheduleDto;
    trainingOverdueCadence?: AlertEntityCadenceDto;
    pendingPips: boolean;
    pendingPipsRun: AlertRunScheduleDto;
    pendingPipsCadence?: AlertEntityCadenceDto;
    lowRatingReviews: boolean;
    lowRatingReviewsRun: AlertRunScheduleDto;
    lowRatingThreshold: number;
  };
  roleBindings: Array<{
    category: AlertRoleBindingCategory;
    /** When omitted, applies to all alert types in the category (legacy / catch-all). */
    subcategory?: string;
    roleId: string;
    channels: AlertChannelPrefsDto;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export type CommandCenterAlertBuckets = {
  financial_labor: CommandCenterAlertRow[];
  inventory_supply_chain: CommandCenterAlertRow[];
  reputation_hr: CommandCenterAlertRow[];
};

export interface CommandCenterAlertRow {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "warning" | "critical";
  createdAt: string;
  dismissable: boolean;
}

/**
 * Command Center API and KPI types.
 */

export const COMMAND_CENTER_METRICS = [
  "netSales",
  "laborCost",
  "reviewRating",
] as const;

export const PERIODS = ["today", "weekToDate"] as const;
export type Period = (typeof PERIODS)[number];

export type CommandCenterMetric =
  (typeof COMMAND_CENTER_METRICS)[number];

export interface HourlySalesRow {
  hour: string;
  today: number | null;
  last_week: number;
}

export interface LocationForKpi {
  timezone: string;
  businessStartTime: string | null;
  squareLocationId: string | null;
  homebaseLocationId: string | null;
}

export interface LaborGoals {
  laborCostGoal: number;
  laborCostGoalTolerance: number;
}

export type LaborCostStatus = "green" | "red" | null;

export interface TodayOnlyKpis {
  netSalesToday: number | null;
  laborCostToday: number | null;
  laborCostPercentToday: number | null;
  laborCostStatus: LaborCostStatus;
}

export interface WeekToDateKpis {
  netSalesToday: number | null;
  netSalesWeekToDate: number | null;
  laborCostToday: number | null;
  laborCostWeekToDate: number | null;
  laborCostPercentToday: number | null;
  laborCostStatusToday: LaborCostStatus;
  laborCostPercentWeekToDate: number | null;
  laborCostStatusWeekToDate: LaborCostStatus;
}

export interface FetchWeekToDateKpisParams {
  /** MongoDB location id (Square/Homebase KPI reads use synced data in DB). */
  locationMongoId?: string;
  location: LocationForKpi;
  rangeToday: { startAt: string; endAt: string };
  rangeWeekToDate: { startAt: string; endAt: string };
  wantNetSales: boolean;
  wantLaborCost: boolean;
  laborCostGoal: number;
}

export interface CommandCenterWantFlags {
  wantNetSales: boolean;
  wantLaborCost: boolean;
  wantReviewRating: boolean;
}

import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";
import type {
  CommandCenterAlertBuckets,
  CommandCenterAlertRow,
} from "../types/alertNotification.types";

export type LaborCostStatus = "green" | "red" | null;

export interface CommandCenterKPIsData {
  netSalesToday?: number | null;
  laborCostToday?: number | null;
  laborCostPercentToday?: number | null;
  laborCostGoal?: number;
  laborCostGoalTolerance?: number;
  laborCostStatus?: LaborCostStatus;
  reviewRating?: number;
  reviewCount?: number;
  reviewRatingOverall?: number | null;
  reviewCountOverall?: number | null;
}

/** Today slice when backend returns dual-period (today + weekToDate). */
export interface CommandCenterKPIsTodaySlice {
  netSalesToday?: number | null;
  laborCostToday?: number | null;
  laborCostPercentToday?: number | null;
  laborCostGoal?: number;
  laborCostGoalTolerance?: number;
  laborCostStatus?: LaborCostStatus;
  reviewRating?: number;
  reviewCount?: number;
  reviewRatingOverall?: number | null;
  reviewCountOverall?: number | null;
}

/** Week-to-date slice when backend returns dual-period. */
export interface CommandCenterKPIsWeekToDateSlice {
  netSalesWeekToDate?: number | null;
  laborCostWeekToDate?: number | null;
  laborCostPercentWeekToDate?: number | null;
  laborCostGoal?: number;
  laborCostGoalTolerance?: number;
  laborCostStatusWeekToDate?: LaborCostStatus;
  reviewRating?: number;
  reviewCount?: number;
  reviewRatingOverall?: number | null;
  reviewCountOverall?: number | null;
}

export interface CommandCenterKPIsDataDual {
  today: CommandCenterKPIsTodaySlice;
  weekToDate: CommandCenterKPIsWeekToDateSlice;
}

export function isCommandCenterKPIsDual(
  data: CommandCenterKPIsData | CommandCenterKPIsDataDual,
): data is CommandCenterKPIsDataDual {
  return typeof data === "object" && data !== null && "today" in data && "weekToDate" in data;
}

export interface HourlySalesRow {
  hour: string;
  today: number | null;
  last_week: number;
}

export interface SourcesOfSalesSegment {
  id: string;
  label: string;
  value: number;
  amount: string;
  color: string;
}

export interface SalesLaborKPIsData {
  actualTotalSales: number | null;
  actualLaborCostPercent: number | null;
  totalHours: number | null;
  salesPerManHour: number | null;
  transactionCount: number | null;
  averageCheck: number | null;
  totalDiscounts: number | null;
  totalRefunds: number | null;
  totalRefundCount: number | null;
  sourcesOfSales: SourcesOfSalesSegment[];
}

export interface HourlyBreakdownData {
  labels: string[];
  netSalesPerHour: number[];
  laborCostPercentPerHour: number[];
}

export interface TimesheetRow {
  name: string;
  role: string;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number;
  status: "On Clock" | "On Break" | "Clocked Out";
  /** Location id; populated only when fetched in all-locations mode. */
  locationId?: string;
  /** Location store name; populated only when fetched in all-locations mode. */
  locationName?: string | null;
}

export type SalesTrendPeriodType =
  | "today"
  | "last7days"
  | "last30days"
  | "last52weeks"
  | "thisWeek"
  | "thisMonth"
  | "thisYear"
  | "custom";

export type SalesTrendComparisonType =
  | "none"
  | "1DayPrior"
  | "samePeriodPreviousWeek"
  | "samePeriodPreviousMonth"
  | "priorYear"
  | "52WeeksPrior"
  | "year2Before"
  | "year3Before"
  | "year4Before"
  | "custom";

export type SalesTrendMetric =
  | "netSales"
  | "transactions"
  | "averageCheck"
  | "laborCost"
  | "hours";

export type SalesTrendGroupBy = "none" | "source";

export interface SalesTrendParams {
  periodType: SalesTrendPeriodType;
  periodStart?: string;
  periodEnd?: string;
  comparisonType: SalesTrendComparisonType;
  comparisonDate?: string;
  comparisonStart?: string;
  comparisonEnd?: string;
  metric: SalesTrendMetric;
  groupBy: SalesTrendGroupBy;
}

/** Params for sales-trend-kpi (period + comparison only). */
export interface SalesTrendKpiParams {
  periodType: SalesTrendPeriodType;
  periodStart?: string;
  periodEnd?: string;
  comparisonType: SalesTrendComparisonType;
  comparisonDate?: string;
  comparisonStart?: string;
  comparisonEnd?: string;
}

export interface SalesTrendKpiPeriodTotals {
  totalNetSales: number;
  totalTransactions: number;
  totalHours: number;
  numDays: number;
}

export interface SalesTrendKpiData {
  /** Period date range (ISO) for display under column header */
  periodRange?: { startAt: string; endAt: string };
  /** Comparison date range (ISO) when comparison is not none */
  comparisonRange?: { startAt: string; endAt: string } | null;
  current: SalesTrendKpiPeriodTotals;
  comparison: SalesTrendKpiPeriodTotals;
}

/** Params for sales-by-category (period + comparison only, same shape as KPI). */
export interface SalesByCategoryParams {
  periodType: SalesTrendPeriodType;
  periodStart?: string;
  periodEnd?: string;
  comparisonType: SalesTrendComparisonType;
  comparisonDate?: string;
  comparisonStart?: string;
  comparisonEnd?: string;
}

export interface SalesByCategoryCategoryItem {
  label: string;
  netSales: number;
}

export interface SalesByCategoryData {
  current: {
    categories: SalesByCategoryCategoryItem[];
    totalNetSales: number;
  };
  comparison: {
    categories: SalesByCategoryCategoryItem[];
    totalNetSales: number;
  };
  /** Period date range (ISO) for display in legend */
  periodRange?: { startAt: string; endAt: string };
  /** Comparison date range (ISO) when comparison is not none */
  comparisonRange?: { startAt: string; endAt: string } | null;
}

export type SalesTrendGranularity = "hourly" | "daily" | "weekly" | "monthly";

export interface SalesTrendLineData {
  xAxisLabels: string[];
  granularity: SalesTrendGranularity;
  /** Nulls indicate future/no-data buckets so the chart line breaks. */
  currentPeriod: (number | null)[];
  comparisonPeriod: (number | null)[];
  /** Period date range (ISO) for display in legend */
  periodRange?: { startAt: string; endAt: string };
  /** Comparison date range (ISO) when comparison is not none */
  comparisonRange?: { startAt: string; endAt: string } | null;
  /** Comparison bucket label per x index (tooltips when overlaid on current-period axis). */
  comparisonPeriodTooltipLabels?: string[];
  /** Current-period tooltip per x index (full date/time from bucket keys; use when x-axis omits date). */
  currentPeriodTooltipLabels?: string[];
}

export interface SalesTrendStackedSeriesItem {
  id: string;
  label: string;
  data: number[];
  color: string;
}

export interface SalesTrendStackedData {
  xAxisLabels: string[];
  granularity: SalesTrendGranularity;
  series: SalesTrendStackedSeriesItem[];
}

export type SalesTrendData = SalesTrendLineData | SalesTrendStackedData;

export function isSalesTrendStacked(
  data: SalesTrendData,
): data is SalesTrendStackedData {
  return "series" in data && Array.isArray(data.series);
}

export const commandCenterService = {
  async getKPIs(
    locationId: string,
    options?: { metrics?: string[]; periods?: ("today" | "weekToDate")[]; signal?: AbortSignal }
  ): Promise<CommandCenterKPIsData | CommandCenterKPIsDataDual> {
    const params: { locationId: string; metrics?: string; periods?: string } = { locationId };
    if (options?.metrics?.length) {
      params.metrics = options.metrics.join(",");
    }
    if (options?.periods?.length) {
      params.periods = options.periods.join(",");
    }
    const res = await api.get<
      ApiResponse<CommandCenterKPIsData | CommandCenterKPIsDataDual>
    >(API_ENDPOINTS.COMMAND_CENTER.KPIS, { params, signal: options?.signal });
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch Command Center KPIs");
    }
    return res.data.data;
  },

  async getHourlySales(locationId: string, options?: { signal?: AbortSignal }): Promise<HourlySalesRow[]> {
    const res = await api.get<ApiResponse<HourlySalesRow[]>>(
      API_ENDPOINTS.COMMAND_CENTER.HOURLY_SALES,
      { params: { locationId }, signal: options?.signal }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch hourly sales");
    }
    return res.data.data;
  },

  async getSalesLaborKPIs(
    locationId: string,
    options?: {
      metrics?: string[];
      periodType?: SalesTrendPeriodType;
      periodStart?: string;
      periodEnd?: string;
      signal?: AbortSignal;
    }
  ): Promise<SalesLaborKPIsData> {
    const params: {
      locationId: string;
      metrics?: string;
      periodType?: SalesTrendPeriodType;
      periodStart?: string;
      periodEnd?: string;
    } = { locationId };
    if (options?.metrics?.length) {
      params.metrics = options.metrics.join(",");
    }
    if (options?.periodType) {
      params.periodType = options.periodType;
      if (options.periodType === "custom") {
        if (options.periodStart) params.periodStart = options.periodStart;
        if (options.periodEnd) params.periodEnd = options.periodEnd;
      }
    }
    const res = await api.get<ApiResponse<SalesLaborKPIsData>>(
      API_ENDPOINTS.SALES_LABOR.KPIS,
      { params, signal: options?.signal }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch Sales & Labor KPIs");
    }
    return res.data.data;
  },

  async getHourlyBreakdown(
    locationId: string,
    options?: {
      periodType?: SalesTrendPeriodType;
      periodStart?: string;
      periodEnd?: string;
      signal?: AbortSignal;
    }
  ): Promise<HourlyBreakdownData> {
    const params: {
      locationId: string;
      periodType?: SalesTrendPeriodType;
      periodStart?: string;
      periodEnd?: string;
    } = { locationId };
    if (options?.periodType) {
      params.periodType = options.periodType;
      if (options.periodType === "custom") {
        if (options.periodStart) params.periodStart = options.periodStart;
        if (options.periodEnd) params.periodEnd = options.periodEnd;
      }
    }
    const res = await api.get<ApiResponse<HourlyBreakdownData>>(
      API_ENDPOINTS.SALES_LABOR.HOURLY_BREAKDOWN,
      { params, signal: options?.signal }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(
        res.data.message ?? "Failed to fetch hourly breakdown"
      );
    }
    return res.data.data;
  },

  async getTimesheet(
    locationId: string,
    options?: {
      periodType?: SalesTrendPeriodType;
      periodStart?: string;
      periodEnd?: string;
      signal?: AbortSignal;
    }
  ): Promise<TimesheetRow[]> {
    const params: {
      locationId: string;
      periodType?: SalesTrendPeriodType;
      periodStart?: string;
      periodEnd?: string;
    } = { locationId };
    if (options?.periodType) {
      params.periodType = options.periodType;
      if (options.periodType === "custom") {
        if (options.periodStart) params.periodStart = options.periodStart;
        if (options.periodEnd) params.periodEnd = options.periodEnd;
      }
    }
    const res = await api.get<ApiResponse<{ rows: TimesheetRow[] }>>(
      API_ENDPOINTS.SALES_LABOR.TIMESHEET,
      { params, signal: options?.signal }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch timesheet");
    }
    return res.data.data.rows;
  },

  async getSalesTrend(
    locationId: string,
    params: SalesTrendParams,
    options?: { signal?: AbortSignal }
  ): Promise<SalesTrendData> {
    const res = await api.get<ApiResponse<SalesTrendData>>(
      API_ENDPOINTS.SALES_LABOR.SALES_TREND,
      {
        params: {
          locationId,
          periodType: params.periodType,
          ...(params.periodStart && { periodStart: params.periodStart }),
          ...(params.periodEnd && { periodEnd: params.periodEnd }),
          comparisonType: params.comparisonType,
          ...(params.comparisonType === 'custom' &&
            params.comparisonStart &&
            params.comparisonEnd && {
              comparisonStart: params.comparisonStart,
              comparisonEnd: params.comparisonEnd,
            }),
          metric: params.metric,
          groupBy: params.groupBy,
        },
        signal: options?.signal,
      }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(
        res.data.message ?? "Failed to fetch sales trend"
      );
    }
    return res.data.data;
  },

  async getSalesTrendKpi(
    locationId: string,
    params: SalesTrendKpiParams,
    options?: { signal?: AbortSignal }
  ): Promise<SalesTrendKpiData> {
    const res = await api.get<ApiResponse<SalesTrendKpiData>>(
      API_ENDPOINTS.SALES_LABOR.SALES_TREND_KPI,
      {
        params: {
          locationId,
          periodType: params.periodType,
          ...(params.periodStart && { periodStart: params.periodStart }),
          ...(params.periodEnd && { periodEnd: params.periodEnd }),
          comparisonType: params.comparisonType,
          ...(params.comparisonType === "custom" &&
            params.comparisonStart &&
            params.comparisonEnd && {
              comparisonStart: params.comparisonStart,
              comparisonEnd: params.comparisonEnd,
            }),
        },
        signal: options?.signal,
      }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch sales trend KPIs");
    }
    return res.data.data;
  },

  async getSalesByCategory(
    locationId: string,
    params: SalesByCategoryParams,
    options?: { signal?: AbortSignal }
  ): Promise<SalesByCategoryData> {
    const res = await api.get<ApiResponse<SalesByCategoryData>>(
      API_ENDPOINTS.SALES_LABOR.SALES_BY_CATEGORY,
      {
        params: {
          locationId,
          periodType: params.periodType,
          ...(params.periodStart && { periodStart: params.periodStart }),
          ...(params.periodEnd && { periodEnd: params.periodEnd }),
          comparisonType: params.comparisonType,
          ...(params.comparisonType === "custom" &&
            params.comparisonStart &&
            params.comparisonEnd && {
              comparisonStart: params.comparisonStart,
              comparisonEnd: params.comparisonEnd,
            }),
        },
        signal: options?.signal,
      }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(
        res.data.message ?? "Failed to fetch sales by category"
      );
    }
    return res.data.data;
  },

  async getAlerts(
    locationId: string,
    options?: { signal?: AbortSignal },
  ): Promise<CommandCenterAlertBuckets> {
    const res = await api.get<ApiResponse<{ alerts: CommandCenterAlertBuckets }>>(
      API_ENDPOINTS.COMMAND_CENTER.ALERTS,
      { params: { locationId }, signal: options?.signal },
    );
    if (!res.data.success || res.data.data?.alerts == null) {
      throw new Error(res.data.message ?? "Failed to fetch Command Center alerts");
    }
    return res.data.data.alerts;
  },

  async getAlertHistory(
    locationId: string,
    category: "financial_labor" | "inventory_supply_chain" | "reputation_hr",
    options?: { signal?: AbortSignal },
  ): Promise<CommandCenterAlertRow[]> {
    const res = await api.get<ApiResponse<{ alerts: CommandCenterAlertRow[] }>>(
      API_ENDPOINTS.COMMAND_CENTER.ALERTS_HISTORY,
      { params: { locationId, category }, signal: options?.signal },
    );
    if (!res.data.success || res.data.data?.alerts == null) {
      throw new Error(res.data.message ?? "Failed to fetch alert history");
    }
    return res.data.data.alerts;
  },

  async dismissAlerts(notificationIds: string[]): Promise<void> {
    await api.post(API_ENDPOINTS.COMMAND_CENTER.ALERTS_DISMISS, { notificationIds });
  },
};

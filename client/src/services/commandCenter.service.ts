import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";

export interface CommandCenterKPIsData {
  netSalesToday: number | null;
  laborCostToday: number | null;
  laborCostPercentToday: number | null;
  laborCostGoal: number;
  laborCostStatus: "green" | "red" | null;
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
  laborCostPercentPerHour: (number | null)[];
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

export type SalesTrendGranularity = "hourly" | "daily" | "weekly" | "monthly";

export interface SalesTrendLineData {
  xAxisLabels: string[];
  granularity: SalesTrendGranularity;
  /** Nulls indicate future/no-data buckets so the chart line breaks. */
  currentPeriod: (number | null)[];
  comparisonPeriod: (number | null)[];
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
  async getKPIs(locationId: string): Promise<CommandCenterKPIsData> {
    const res = await api.get<ApiResponse<CommandCenterKPIsData>>(
      API_ENDPOINTS.COMMAND_CENTER.KPIS,
      { params: { locationId } }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch Command Center KPIs");
    }
    return res.data.data;
  },

  async getHourlySales(locationId: string): Promise<HourlySalesRow[]> {
    const res = await api.get<ApiResponse<HourlySalesRow[]>>(
      API_ENDPOINTS.COMMAND_CENTER.HOURLY_SALES,
      { params: { locationId } }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch hourly sales");
    }
    return res.data.data;
  },

  async getSalesLaborKPIs(locationId: string): Promise<SalesLaborKPIsData> {
    const res = await api.get<ApiResponse<SalesLaborKPIsData>>(
      API_ENDPOINTS.SALES_LABOR.KPIS,
      { params: { locationId } }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to fetch Sales & Labor KPIs");
    }
    return res.data.data;
  },

  async getHourlyBreakdown(
    locationId: string
  ): Promise<HourlyBreakdownData> {
    const res = await api.get<ApiResponse<HourlyBreakdownData>>(
      API_ENDPOINTS.SALES_LABOR.HOURLY_BREAKDOWN,
      { params: { locationId } }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(
        res.data.message ?? "Failed to fetch hourly breakdown"
      );
    }
    return res.data.data;
  },

  async getSalesTrend(
    locationId: string,
    params: SalesTrendParams
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
      }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(
        res.data.message ?? "Failed to fetch sales trend"
      );
    }
    return res.data.data;
  },
};

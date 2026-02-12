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
};

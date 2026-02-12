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
};

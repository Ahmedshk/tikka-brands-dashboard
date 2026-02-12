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
};

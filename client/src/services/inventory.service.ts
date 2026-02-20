import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";

export interface InventoryKPIsData {
  currentFoodCost: number | null;
  inventoryValue: number | null;
  wasteCost: number | null;
  pendingOrdersCount: number | null;
  countPeriodStart?: string | null;
  countPeriodEnd?: string | null;
  pendingOrdersPeriodStart?: string | null;
  pendingOrdersPeriodEnd?: string | null;
}

export const inventoryService = {
  async getInventoryKPIs(locationId: string): Promise<InventoryKPIsData> {
    const res = await api.get<ApiResponse<InventoryKPIsData>>(
      API_ENDPOINTS.INVENTORY.KPIS,
      { params: { locationId } },
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to load inventory KPIs");
    }
    return res.data.data;
  },
};

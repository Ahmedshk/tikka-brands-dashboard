import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";

export interface InventoryKPIsData {
  currentFoodCost: number | null;
  inventoryValue: number | null;
  wasteCost: number | null;
  foodCostPercent?: number | null;
  theoreticalUsage?: number | null;
  theoreticalUsagePercent?: number | null;
  varianceItems?: Array<{
    label: string;
    varianceCost: number;
    actualCost?: number;
    theoreticalCost?: number;
    actualQuantity?: number;
    theoreticalQuantity?: number;
    uom?: string;
  }>;
  pendingOrdersCount: number | null;
  countPeriodStart?: string | null;
  countPeriodEnd?: string | null;
  pendingOrdersPeriodStart?: string | null;
  pendingOrdersPeriodEnd?: string | null;
}

export type OrderTrackerPeriodType =
  | "currentWeek"
  | "lastWeek"
  | "currentMonth"
  | "lastMonth"
  | "currentYear"
  | "lastYear"
  | "today"
  | "tomorrow"
  | "since3DaysAgo"
  | "lastNext30Days"
  | "custom";

export interface OrderTrackerOrderItem {
  ItemName?: string;
  SKU?: string;
  Quantity?: number;
  Price?: number;
  PriceTotal?: number;
  ItemMeasureTypeName?: string;
  PackQuantity?: number;
  PacksPerCase?: number;
}

export interface OrderTrackerOrderDetails {
  OrderNumber?: string;
  BuyerName?: string;
  VendorName?: string;
  OrderStatus?: string;
  OrderStatusUIName?: string;
  DeliveryDateUTC?: string;
  SentDateUTC?: string;
  PriceTotalWithVAT?: number;
  PriceTotalWithoutVAT?: number;
  Comments?: string;
  Items?: OrderTrackerOrderItem[];
}

export interface OrderTrackerOrder {
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  sentDate: string;
  status: string;
  orderDetails: OrderTrackerOrderDetails;
}

export interface GetOrdersParams {
  periodType: OrderTrackerPeriodType;
  periodStart?: string;
  periodEnd?: string;
}

/** Normalize date from server (yyyy/MM/dd) to client format (yyyy-MM-dd). */
function normalizeDateToClient(serverDate: string): string {
  return serverDate.replaceAll('/', '-');
}

export const inventoryService = {
  async getValidCountDates(
    locationId: string,
    options?: { signal?: AbortSignal }
  ): Promise<{ startDates: string[]; endDates: string[] }> {
    const res = await api.get<
      ApiResponse<{ startDates: string[]; endDates: string[] }>
    >(API_ENDPOINTS.INVENTORY.VALID_COUNT_DATES, {
      params: { locationId },
      signal: options?.signal,
    });
    if (!res.data.success || res.data.data == null) {
      throw new Error(
        res.data.message ?? "Failed to load valid count dates"
      );
    }
    const { startDates, endDates } = res.data.data;
    return {
      startDates: (startDates ?? []).map(normalizeDateToClient),
      endDates: (endDates ?? []).map(normalizeDateToClient),
    };
  },

  async getInventoryKPIs(
    locationId: string,
    options?: {
      metrics?: string[];
      pendingOrdersPeriod?: 'thisWeek' | 'lastWeek';
      countPeriodStart?: string;
      countPeriodEnd?: string;
      signal?: AbortSignal;
    }
  ): Promise<InventoryKPIsData> {
    const params: {
      locationId: string;
      metrics?: string;
      pendingOrdersPeriod?: string;
      countPeriodStart?: string;
      countPeriodEnd?: string;
    } = { locationId };
    if (options?.metrics?.length) {
      params.metrics = options.metrics.join(',');
    }
    if (options?.pendingOrdersPeriod) {
      params.pendingOrdersPeriod = options.pendingOrdersPeriod;
    }
    if (options?.countPeriodStart) {
      params.countPeriodStart = options.countPeriodStart;
    }
    if (options?.countPeriodEnd) {
      params.countPeriodEnd = options.countPeriodEnd;
    }
    const res = await api.get<ApiResponse<InventoryKPIsData>>(
      API_ENDPOINTS.INVENTORY.KPIS,
      { params, signal: options?.signal },
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to load inventory KPIs");
    }
    return res.data.data;
  },

  async getOrders(
    locationId: string,
    params: GetOrdersParams,
    options?: { signal?: AbortSignal }
  ): Promise<OrderTrackerOrder[]> {
    const res = await api.get<ApiResponse<{ orders: OrderTrackerOrder[] }>>(
      API_ENDPOINTS.INVENTORY.ORDERS,
      {
        params: {
          locationId,
          periodType: params.periodType,
          ...(params.periodStart && { periodStart: params.periodStart }),
          ...(params.periodEnd && { periodEnd: params.periodEnd }),
        },
        signal: options?.signal,
      }
    );
    if (!res.data.success || res.data.data == null) {
      throw new Error(res.data.message ?? "Failed to load orders");
    }
    return res.data.data.orders;
  },
};

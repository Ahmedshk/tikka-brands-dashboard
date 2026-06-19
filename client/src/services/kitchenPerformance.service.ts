import api from "./api.service";
import type { LocationApiParams } from "../utils/locationSelectionHelpers";
import { resolveLocationQuery } from "../utils/locationSelectionHelpers";
import { API_ENDPOINTS } from "../utils/constants";
import type { ApiResponse } from "../types";
import type {
  KitchenPerformanceDetails,
  KitchenPerformancePaginationMeta,
  KitchenPerformanceReportPayload,
  KitchenPerformanceRow,
} from "../types/kitchenPerformance.types";

interface KitchenPerformanceListResponse {
  rows: KitchenPerformanceRow[];
  meta: KitchenPerformancePaginationMeta;
}

export interface KitchenPerformanceDateRange {
  startDate: string;
  endDate: string;
}

export function formatDateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface KitchenPerformanceImportResult {
  importedRows: number;
  daysUpdated?: string[];
}

export const kitchenPerformanceService = {
  async getRows(
    locationQuery: LocationApiParams | string,
    range: KitchenPerformanceDateRange,
    options: { page?: number; limit?: number } = {},
  ): Promise<KitchenPerformanceListResponse> {
    const params = new URLSearchParams({
      ...resolveLocationQuery(locationQuery),
      startDate: range.startDate,
      endDate: range.endDate,
      page: String(options.page ?? 1),
      limit: String(options.limit ?? 10),
    });
    const res = await api.get<
      ApiResponse<KitchenPerformanceRow[]> & {
        meta?: KitchenPerformancePaginationMeta;
      }
    >(`${API_ENDPOINTS.KITCHEN_PERFORMANCE.LIST}?${params.toString()}`);

    if (!res.data.success) {
      throw new Error(res.data.message ?? "Failed to load kitchen performance.");
    }

    return {
      rows: Array.isArray(res.data.data) ? res.data.data : [],
      meta: res.data.meta ?? {
        total: 0,
        page: 1,
        limit: options.limit ?? 10,
        totalPages: 1,
      },
    };
  },

  async importCsv(
    locationId: string,
    range: KitchenPerformanceDateRange,
    file: File,
  ): Promise<KitchenPerformanceImportResult> {
    const form = new FormData();
    form.append("locationId", locationId);
    form.append("startDate", range.startDate);
    form.append("endDate", range.endDate);
    form.append("file", file);

    const res = await api.post<
      ApiResponse<{ importedRows: number; daysUpdated?: string[] }>
    >(API_ENDPOINTS.KITCHEN_PERFORMANCE.IMPORT, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message ?? "Failed to import kitchen performance CSV.");
    }
    return {
      importedRows: res.data.data.importedRows,
      daysUpdated: res.data.data.daysUpdated,
    };
  },

  async getDetails(
    locationId: string,
    range: KitchenPerformanceDateRange,
    deviceName: string,
  ): Promise<KitchenPerformanceDetails> {
    const params = new URLSearchParams({
      locationId,
      startDate: range.startDate,
      endDate: range.endDate,
      deviceName,
    });
    const res = await api.get<ApiResponse<KitchenPerformanceDetails>>(
      `${API_ENDPOINTS.KITCHEN_PERFORMANCE.DETAILS}?${params.toString()}`,
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(
        res.data.message ?? "Failed to load kitchen performance details.",
      );
    }
    return res.data.data;
  },

  async runReport(
    locationQuery: LocationApiParams | string,
    range: KitchenPerformanceDateRange,
  ): Promise<KitchenPerformanceReportPayload> {
    const params = new URLSearchParams(resolveLocationQuery(locationQuery));
    const res = await api.post<ApiResponse<KitchenPerformanceReportPayload>>(
      `${API_ENDPOINTS.KITCHEN_PERFORMANCE.REPORT}?${params.toString()}`,
      {
        startDate: range.startDate,
        endDate: range.endDate,
      },
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message ?? "Failed to run kitchen performance report.");
    }
    return res.data.data;
  },

  async getReportDetails(
    locationId: string,
    range: KitchenPerformanceDateRange,
    deviceName: string,
  ): Promise<KitchenPerformanceDetails> {
    const params = new URLSearchParams({
      locationId,
      startDate: range.startDate,
      endDate: range.endDate,
      deviceName,
    });
    const res = await api.get<ApiResponse<KitchenPerformanceDetails>>(
      `${API_ENDPOINTS.KITCHEN_PERFORMANCE.REPORT_DETAILS}?${params.toString()}`,
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(
        res.data.message ?? "Failed to load kitchen performance report details.",
      );
    }
    return res.data.data;
  },

  async getReportTicketModifiers(
    locationId: string,
    range: KitchenPerformanceDateRange,
    orderIds: string[],
  ): Promise<Record<string, Record<string, string[]>>> {
    const params = new URLSearchParams({
      locationId,
      startDate: range.startDate,
      endDate: range.endDate,
      orderIds: orderIds.join(","),
    });
    const res = await api.get<ApiResponse<Record<string, Record<string, string[]>>>>(
      `${API_ENDPOINTS.KITCHEN_PERFORMANCE.REPORT_TICKET_MODIFIERS}?${params.toString()}`,
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(
        res.data.message ?? "Failed to load kitchen performance ticket modifiers.",
      );
    }
    return res.data.data;
  },
};

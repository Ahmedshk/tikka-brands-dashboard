import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";

export type IntegrationSyncResource =
  | "square_payments"
  | "square_orders"
  | "square_catalog"
  | "square_team_members"
  | "homebase_timecards"
  | "marketman_valid_count_dates"
  | "marketman_orders_sent"
  | "marketman_orders_delivery"
  | "marketman_orders_both";

/** Older log rows may still reference removed manual-sync resources */
export type IntegrationSyncLogResource =
  | IntegrationSyncResource
  | "all_resources_today"
  | "marketman_actual_theo"
  | "marketman_waste";

export interface IntegrationSyncProgress {
  current: number;
  total: number;
  label?: string;
}

export interface IntegrationSyncLocationResult {
  upserted: number;
  errors: string[];
}

export interface RunIntegrationSyncBody {
  resource: IntegrationSyncResource;
  locationIds?: string[];
  startDate?: string;
  endDate?: string;
}

export interface StartIntegrationSyncResponse {
  logId: string;
  started: true;
}

export interface IntegrationSyncLogRow {
  _id: string;
  resource: IntegrationSyncLogResource;
  locationIds: string[];
  startDate?: string;
  endDate?: string;
  status: string;
  message?: string;
  counts?: Record<string, number>;
  progress?: IntegrationSyncProgress;
  byLocation?: Record<string, IntegrationSyncLocationResult>;
  createdAt: string;
  updatedAt: string;
}

export const integrationSyncService = {
  async run(body: RunIntegrationSyncBody): Promise<StartIntegrationSyncResponse> {
    const { data } = await api.post<StartIntegrationSyncResponse>(
      API_ENDPOINTS.INTEGRATION_SYNC.RUN,
      body,
    );
    return data;
  },

  async runAllToday(): Promise<StartIntegrationSyncResponse> {
    const { data } = await api.post<StartIntegrationSyncResponse>(
      API_ENDPOINTS.INTEGRATION_SYNC.RUN_ALL_TODAY,
      {},
    );
    return data;
  },

  async getActive(): Promise<{ active: IntegrationSyncLogRow[] }> {
    const { data } = await api.get<{ active: IntegrationSyncLogRow[] }>(
      API_ENDPOINTS.INTEGRATION_SYNC.ACTIVE,
    );
    return data;
  },

  async getLogs(params?: { page?: number; limit?: number }): Promise<{
    logs: IntegrationSyncLogRow[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 10;
    const { data } = await api.get<{
      logs: IntegrationSyncLogRow[];
      total: number;
      page: number;
      limit: number;
    }>(API_ENDPOINTS.INTEGRATION_SYNC.LOGS, { params: { page, limit } });
    return data;
  },
};

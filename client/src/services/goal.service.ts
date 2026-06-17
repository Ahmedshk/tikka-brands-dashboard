import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";
import type { LocationApiParams } from "../utils/locationSelectionHelpers";
import { resolveLocationQuery } from "../utils/locationSelectionHelpers";
import type {
  Goal,
  GoalSetting,
  GoalValues,
  GoalDayOfWeek,
  FutureWeekGoals,
  ResolvedGoalWithSource,
  GoalDailyActuals,
} from "../types";

const BASE = API_ENDPOINTS.GOALS;

/**
 * Get current calendar date in the given IANA timezone as YYYY-MM-DD.
 */
export function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = get("year");
  const m = get("month").padStart(2, "0");
  const d = get("day").padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const goalService = {
  /**
   * Get full goal setting for editing (default, weekly, futureWeeks).
   */
  async getByLocationId(locationId: string, options?: { signal?: AbortSignal }): Promise<GoalSetting> {
    const res = await api.get<ApiResponse<{ goals: GoalSetting }>>(BASE, {
      params: { locationId },
      signal: options?.signal,
    });
    if (!res.data.success || res.data.data?.goals == null) {
      throw new Error(res.data.message ?? "Failed to fetch goals");
    }
    return res.data.data.goals;
  },

  /**
   * Get resolved goals for a specific date (YYYY-MM-DD in location timezone).
   */
  async getResolved(
    locationQuery: LocationApiParams | string,
    date: string,
    options?: { signal?: AbortSignal },
  ): Promise<Goal> {
    const { goal } = await this.getResolvedWithSource(locationQuery, date, options);
    return goal;
  },

  /**
   * Aggregated goals over [startDate, endDate] in one request — server sums sales/hours
   * and averages rates/tolerances across the range (and across locations for __all__).
   */
  async getResolvedRange(
    locationQuery: LocationApiParams | string,
    startDate: string,
    endDate: string,
    options?: { signal?: AbortSignal },
  ): Promise<Goal> {
    const res = await api.get<ApiResponse<{ goals: Goal; source?: string }>>(
      `${BASE}/range`,
      {
        params: { ...resolveLocationQuery(locationQuery), startDate, endDate },
        signal: options?.signal,
      },
    );
    if (!res.data.success || res.data.data?.goals == null) {
      throw new Error(res.data.message ?? "Failed to fetch goals");
    }
    return res.data.data.goals;
  },

  /**
   * Get resolved goals and source for a date (for Previous goals tab).
   */
  async getResolvedWithSource(
    locationQuery: LocationApiParams | string,
    date: string,
    options?: { signal?: AbortSignal }
  ): Promise<ResolvedGoalWithSource> {
    const res = await api.get<
      ApiResponse<{
        goals: Goal;
        source: ResolvedGoalWithSource["source"];
        defaultSnapshotEffectiveFrom?: string;
      }>
    >(BASE, {
      params: { ...resolveLocationQuery(locationQuery), date },
      signal: options?.signal,
    });
    if (!res.data.success || res.data.data?.goals == null) {
      throw new Error(res.data.message ?? "Failed to fetch goals");
    }
    const data = res.data.data;
    return {
      goal: data.goals,
      source: data.source ?? "default",
      ...(data.defaultSnapshotEffectiveFrom != null
        ? { defaultSnapshotEffectiveFrom: data.defaultSnapshotEffectiveFrom }
        : {}),
    };
  },

  /**
   * Batch actuals for goal metrics by business date (YYYY-MM-DD in location timezone).
   */
  async getDailyActuals(
    locationId: string,
    dates: string[],
    options?: { signal?: AbortSignal }
  ): Promise<Record<string, GoalDailyActuals>> {
    const res = await api.get<
      ApiResponse<{ actualsByDate: Record<string, GoalDailyActuals> }>
    >(`${BASE}/daily-actuals`, {
      params: { locationId, dates: dates.join(",") },
      signal: options?.signal,
    });
    if (!res.data.success || res.data.data?.actualsByDate == null) {
      throw new Error(res.data.message ?? "Failed to fetch goal actuals");
    }
    return res.data.data.actualsByDate;
  },

  async upsert(payload: {
    locationId: string;
    default?: GoalValues;
    weekly?: Partial<Record<GoalDayOfWeek, GoalValues>>;
    futureWeeks?: FutureWeekGoals[];
  }): Promise<GoalSetting> {
    const res = await api.put<ApiResponse<{ goals: GoalSetting }>>(BASE, payload);
    if (!res.data.success || !res.data.data?.goals) {
      throw new Error(res.data.message ?? "Failed to save goals");
    }
    return res.data.data.goals;
  },
};

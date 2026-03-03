import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import { ApiResponse } from "../types";
import type {
  Goal,
  GoalSetting,
  GoalValues,
  GoalDayOfWeek,
  FutureWeekGoals,
  ResolvedGoalWithSource,
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
  async getResolved(locationId: string, date: string, options?: { signal?: AbortSignal }): Promise<Goal> {
    const { goal } = await this.getResolvedWithSource(locationId, date, options);
    return goal;
  },

  /**
   * Get resolved goals and source for a date (for Previous goals tab).
   */
  async getResolvedWithSource(
    locationId: string,
    date: string,
    options?: { signal?: AbortSignal }
  ): Promise<ResolvedGoalWithSource> {
    const res = await api.get<
      ApiResponse<{ goals: Goal; source: ResolvedGoalWithSource["source"] }>
    >(BASE, {
      params: { locationId, date },
      signal: options?.signal,
    });
    if (!res.data.success || res.data.data?.goals == null) {
      throw new Error(res.data.message ?? "Failed to fetch goals");
    }
    const data = res.data.data;
    return {
      goal: data.goals,
      source: data.source ?? "default",
    };
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

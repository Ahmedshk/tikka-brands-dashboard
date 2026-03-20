import api from "./api.service";
import type {
  ReviewSettings,
  ReviewCycle,
  ReviewCycleSnapshot,
  SelfReview,
  ManagerReview,
  ActionPlan,
  ActionPlanItem,
  CheckIn,
  QuestionResponse,
} from "../types/review.types";

export const reviewService = {
  // --- Review Settings ---
  async getSettings(): Promise<ReviewSettings | null> {
    const { data } = await api.get("/reviews/settings");
    return data.data;
  },

  async updateSettings(settings: Partial<ReviewSettings>): Promise<ReviewSettings> {
    const { data } = await api.put("/reviews/settings", settings);
    return data.data;
  },

  // --- Review Cycles ---
  async getCycles(params?: Record<string, string>): Promise<{ cycles: ReviewCycle[]; total: number }> {
    const { data } = await api.get("/reviews/cycles", { params });
    return data.data;
  },

  async getCycleById(id: string): Promise<ReviewCycle> {
    const { data } = await api.get(`/reviews/cycles/${id}`);
    return data.data;
  },

  /** Read-only aggregated cycle + reviews + check-ins (for Past Review detail). */
  async getCycleSnapshot(id: string): Promise<ReviewCycleSnapshot> {
    const { data } = await api.get(`/reviews/cycles/${id}/snapshot`);
    return data.data as ReviewCycleSnapshot;
  },

  async getDashboard(params?: Record<string, string>): Promise<Record<string, unknown>> {
    const { data } = await api.get("/reviews/dashboard", { params });
    return data.data;
  },

  /** Start a review cycle for a user (employee). Returns { started: true } or throws with message. */
  async startCycleForUser(userId: string): Promise<{ started: boolean }> {
    const { data } = await api.post<{ success: boolean; data?: { started: boolean }; message?: string }>(
      "/reviews/cycles/start-for-user",
      { userId }
    );
    if (data.success && data.data?.started) return { started: true };
    throw new Error((data as { message?: string }).message ?? "Could not start review cycle");
  },

  // --- Self-Review ---
  async submitSelfReview(cycleId: string, responses: QuestionResponse[]): Promise<SelfReview> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/self-review`, { responses });
    return data.data;
  },

  async getSelfReview(cycleId: string): Promise<SelfReview | null> {
    const { data } = await api.get(`/reviews/cycles/${cycleId}/self-review`);
    return data.data;
  },

  /** Public (no auth): get self-review form by token for email link. */
  async getSelfReviewByToken(token: string): Promise<{
    cycleId: string;
    questionnaire: Array<{ id: string; text: string; type: string; required: boolean; order: number; options?: string[] }>;
    employeeName: string;
    alreadySubmitted: boolean;
  } | null> {
    const res = await api.get<{ success: boolean; data?: unknown; valid?: boolean }>(
      "/reviews/self-review/by-token",
      { params: { token } },
    );
    if (!res.data.success || !res.data.data) return null;
    return res.data.data as {
      cycleId: string;
      questionnaire: Array<{ id: string; text: string; type: string; required: boolean; order: number; options?: string[] }>;
      employeeName: string;
      alreadySubmitted: boolean;
    };
  },

  /** Public (no auth): submit self-review by token. */
  async submitSelfReviewByToken(
    token: string,
    responses: QuestionResponse[],
  ): Promise<void> {
    await api.post("/reviews/self-review/submit-by-token", { token, responses });
  },

  // --- Manager Review ---
  async completeManagerReview(cycleId: string, responses: QuestionResponse[]): Promise<ManagerReview> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/manager-review/complete`, { responses });
    return data.data;
  },

  async submitManagerReview(cycleId: string, responses: QuestionResponse[]): Promise<ManagerReview> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/manager-review`, { responses });
    return data.data;
  },

  async updateManagerReview(cycleId: string, responses: QuestionResponse[]): Promise<ManagerReview> {
    const { data } = await api.put(`/reviews/cycles/${cycleId}/manager-review`, { responses });
    return data.data;
  },

  async getManagerReview(cycleId: string): Promise<ManagerReview | null> {
    const { data } = await api.get(`/reviews/cycles/${cycleId}/manager-review`);
    return data.data;
  },

  // --- Director Approval ---
  async approveReview(cycleId: string, body: { comments?: string; salaryIncrement?: number }): Promise<ReviewCycle> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/approve`, body);
    return data.data;
  },

  async rejectReview(cycleId: string, body: { comments: string }): Promise<ReviewCycle> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/reject`, body);
    return data.data;
  },

  // --- Action Plan ---
  async createActionPlan(cycleId: string, items: ActionPlanItem[]): Promise<ActionPlan> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/action-plan`, { items });
    return data.data;
  },

  async getActionPlan(cycleId: string): Promise<ActionPlan | null> {
    const { data } = await api.get(`/reviews/cycles/${cycleId}/action-plan`);
    return data.data;
  },

  // --- Complete Review ---
  async completeReview(cycleId: string): Promise<ReviewCycle> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/complete`);
    return data.data;
  },

  // --- Check-ins ---
  async submitCheckIn(
    cycleId: string,
    period: "30" | "60",
    body: {
      responses: QuestionResponse[];
      managerComments?: string;
      actionPlanProgress?: string;
      actionItemProgress?: { actionPlanItemIndex: number; value?: string }[];
    },
  ): Promise<CheckIn> {
    const { data } = await api.post(`/reviews/cycles/${cycleId}/check-in/${period}`, body);
    return data.data;
  },

  async uploadCheckInDocument(cycleId: string, period: "30" | "60", files: File[]): Promise<CheckIn> {
    const formData = new FormData();
    files.forEach((file) => formData.append("documents", file));
    const { data } = await api.post(`/reviews/cycles/${cycleId}/check-in/${period}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data;
  },
};

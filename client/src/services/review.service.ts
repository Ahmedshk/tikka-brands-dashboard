import axios from "axios";
import api from "./api.service";
import { API_BASE_URL } from "../utils/constants";
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

  async uploadQuestionnaireDocument(file: File): Promise<{
    publicId: string;
    resourceType: "image" | "raw";
    filename?: string;
    format?: string;
  }> {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post("/reviews/settings/upload-document", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data as {
      publicId: string;
      resourceType: "image" | "raw";
      filename?: string;
      format?: string;
    };
  },

  // --- Review Cycles ---
  async getCycles(
    params?: Record<string, string>,
    config?: { signal?: AbortSignal },
  ): Promise<{ cycles: ReviewCycle[]; total: number }> {
    const { data } = await api.get("/reviews/cycles", { params, signal: config?.signal });
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
    questionnaire: Array<{
      id: string;
      text: string;
      type: string;
      required: boolean;
      order: number;
      options?: string[];
      attachments?: Array<{
        publicId: string;
        resourceType: "image" | "raw";
        filename?: string;
        format?: string;
        url?: string;
      }>;
    }>;
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
      questionnaire: Array<{
        id: string;
        text: string;
        type: string;
        required: boolean;
        order: number;
        options?: string[];
        attachments?: Array<{
          publicId: string;
          resourceType: "image" | "raw";
          filename?: string;
          format?: string;
          url?: string;
        }>;
      }>;
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
  async approveReview(
    cycleId: string,
    body: { comments?: string; salaryIncrement?: number; salaryIncrementType?: "percent" | "fixed" },
  ): Promise<ReviewCycle> {
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

/**
 * Public self-review link: fetch questionnaire attachment through the API (correct filename/extension for raw files).
 */
export async function openSelfReviewAttachmentByToken(
  token: string,
  publicId: string,
  suggestedFilename?: string,
): Promise<void> {
  const base = API_BASE_URL.replace(/\/$/, "");
  const params = new URLSearchParams({ token, publicId });
  const res = await axios.get(`${base}/reviews/self-review/document?${params.toString()}`, {
    responseType: "blob",
    withCredentials: true,
  });
  if (res.status !== 200 || !(res.data instanceof Blob)) {
    throw new Error("Failed to load document");
  }
  const blob = res.data;
  const blobUrl = URL.createObjectURL(blob);
  if (suggestedFilename?.trim()) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = suggestedFilename.trim();
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } else {
    const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    else URL.revokeObjectURL(blobUrl);
  }
}

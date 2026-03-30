import type { Types } from "mongoose";

export const REVIEW_CYCLE_STATUSES = [
  "upcoming",
  "notification_sent_75",
  "form_available_85",
  "self_review_due",
  "self_review_late",
  "self_review_past_due",
  "self_review_submitted",
  "manager_review_due",
  "manager_review_pending",
  "manager_review_past_due",
  "manager_review_submitted",
  "director_approval_due",
  "director_approval_pending",
  "director_approval_past_due",
  "approved",
  "rejected",
  "sharing_due",
  "sharing_pending",
  "sharing_past_due",
  "completed",
  "checkin_30_due",
  "checkin_30_past_due",
  "checkin_30_complete",
  "checkin_30_done",
  "checkin_60_due",
  "checkin_60_past_due",
  "checkin_60_complete",
  "checkin_60_done",
  "cycle_complete",
  "cycle_superseded",
] as const;

export type ReviewCycleStatus = (typeof REVIEW_CYCLE_STATUSES)[number];

/** How `salaryIncrement` should be interpreted when director approves. */
export type SalaryIncrementType = "percent" | "fixed";

/** Cycles that no longer block starting a new review cycle for the employee. */
export const REVIEW_CYCLE_TERMINAL_FOR_NEW_CYCLE: ReviewCycleStatus[] = [
  "cycle_complete",
  "cycle_superseded",
];

/**
 * Cycles for the Past Reviews list only after the 60-day check-in is done (or cycle ended).
 * `completed` = final review + action plan done but check-ins may still be due — keep in active list.
 */
export const REVIEW_CYCLE_PAST_STATUSES: ReviewCycleStatus[] = [
  "cycle_complete",
  "cycle_superseded",
  "rejected",
  "checkin_60_complete",
  "checkin_60_done",
];

export interface QuestionResponse {
  questionId: string;
  questionText: string;
  answer: string;
}

export interface IReviewCycle {
  _id?: string;
  employeeId: Types.ObjectId | string;
  cycleNumber: number;
  referenceDate: Date;
  status: ReviewCycleStatus;
  selfReviewId?: Types.ObjectId | string;
  managerReviewId?: Types.ObjectId | string;
  reviewedByManagerId?: Types.ObjectId | string;
  approvedByDirectorId?: Types.ObjectId | string;
  /** Set when manager submits to director; used for the 3-day director deadline. */
  directorApprovalStartedAt?: Date;
  directorDecision?: "approved" | "rejected" | null;
  directorComments?: string;
  salaryIncrement?: number;
  /** When omitted and `salaryIncrement` is set (legacy), treat as percent. */
  salaryIncrementType?: SalaryIncrementType;
  actionPlanId?: Types.ObjectId | string;
  checkIn30Id?: Types.ObjectId | string;
  checkIn60Id?: Types.ObjectId | string;
  completedAt?: Date;
  notifyDate75: Date;
  formAvailableDate85: Date;
  dueDate90: Date;
  /** Fallback reference date for the next cycle if this one stalls (referenceDate + 90d). */
  scheduledNextCycleReferenceDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

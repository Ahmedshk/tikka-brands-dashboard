import type { HomebaseData } from "./userManagement.types";

export const QUESTION_TYPES = ["text", "rating", "multiple_choice", "yes_no"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Uploaded reference document for a review question (same storage pattern as training modules). */
export interface ReviewQuestionAttachment {
  publicId: string;
  resourceType: "image" | "raw";
  filename?: string;
  format?: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  order: number;
  attachments?: ReviewQuestionAttachment[];
}

export interface ReviewSettings {
  _id?: string;
  employeeRoleIds: (string | { _id: string; name: string })[];
  managerRoleIds: (string | { _id: string; name: string })[];
  directorRoleIds: (string | { _id: string; name: string })[];
  selfReviewQuestionnaire: Question[];
  managerReviewQuestionnaire: Question[];
  checkInQuestionnaire: Question[];
  isConfigured: boolean;
}

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

export interface QuestionResponse {
  questionId: string;
  questionText: string;
  answer: string;
}

export interface ReviewCycle {
  _id: string;
  employeeId:
    | string
    | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        role?: string;
        startDate?: string;
        profileImagePublicId?: string;
        homebaseData?: HomebaseData | null;
      };
  cycleNumber: number;
  referenceDate: string;
  status: ReviewCycleStatus;
  selfReviewId?: string;
  managerReviewId?: string;
  reviewedByManagerId?: string | { _id: string; firstName: string; lastName: string; email?: string; role?: string };
  approvedByDirectorId?: string | { _id: string; firstName: string; lastName: string; email?: string; role?: string };
  /** ISO date: when the review was submitted to the director (director deadline anchor). */
  directorApprovalStartedAt?: string;
  directorDecision?: "approved" | "rejected" | null;
  directorComments?: string;
  salaryIncrement?: number;
  actionPlanId?: string;
  checkIn30Id?: string;
  checkIn60Id?: string;
  completedAt?: string;
  notifyDate75: string;
  formAvailableDate85: string;
  dueDate90: string;
  scheduledNextCycleReferenceDate?: string;
  createdAt: string;
  updatedAt: string;
}

/** Aggregated read-only view for Past Review detail */
export interface ReviewCycleSnapshot {
  cycle: ReviewCycle;
  selfReview: SelfReview | null;
  managerReview: ManagerReview | null;
  actionPlan: ActionPlan | null;
  checkIns: CheckIn[];
}

export interface SelfReview {
  _id: string;
  reviewCycleId: string;
  employeeId: string;
  responses: QuestionResponse[];
  submittedAt: string;
}

export interface ManagerReview {
  _id: string;
  reviewCycleId: string;
  managerId: string;
  employeeId: string;
  responses: QuestionResponse[];
  revisionHistory: { responses: QuestionResponse[]; updatedAt: string }[];
  submittedAt: string;
  lastUpdatedAt?: string;
}

export interface ActionPlanItem {
  _id?: string;
  period: "30" | "60" | "90";
  description: string;
  targetScore?: string;
  currentScore?: string;
}

export interface ActionPlan {
  _id: string;
  reviewCycleId: string;
  employeeId: string;
  createdByManagerId: string;
  items: ActionPlanItem[];
}

export interface CheckIn {
  _id: string;
  reviewCycleId: string;
  period: "30" | "60";
  managerId: string;
  employeeId: string;
  responses: QuestionResponse[];
  documentUrl?: string;
  documents?: {
    url?: string;
    publicId: string;
    filename?: string;
    resourceType?: string;
    format?: string;
  }[];
  managerComments?: string;
  actionPlanProgress?: string;
  actionItemProgress?: { actionPlanItemIndex: number; value?: string }[];
  submittedAt: string;
}

export function getStatusLabel(status: ReviewCycleStatus): string {
  const map: Record<ReviewCycleStatus, string> = {
    upcoming: "Upcoming",
    notification_sent_75: "75-Day Notice Sent",
    form_available_85: "Form Available",
    self_review_due: "Self-Review Due",
    self_review_late: "Self-Review Late",
    self_review_past_due: "Self-Review Past Due",
    self_review_submitted: "Self-Review Submitted",
    manager_review_due: "Manager Review Due",
    manager_review_pending: "Manager Review Due",
    manager_review_past_due: "Manager Review Past Due",
    manager_review_submitted: "Manager Review Submitted",
    director_approval_due: "Director Approval Due",
    director_approval_pending: "Director Approval Due",
    director_approval_past_due: "Director Approval Past Due",
    approved: "Approved",
    rejected: "Rejected",
    sharing_due: "Final Review Due",
    sharing_pending: "Final Review Due",
    sharing_past_due: "Sharing Past Due",
    completed: "Completed",
    checkin_30_due: "30-Day Check-in Due",
    checkin_30_past_due: "30-Day Check-in Past Due",
    checkin_30_complete: "30-Day Check-in Complete",
    checkin_30_done: "30-Day Check-in Complete",
    checkin_60_due: "60-Day Check-in Due",
    checkin_60_past_due: "60-Day Check-in Past Due",
    checkin_60_complete: "60-Day Check-in Complete",
    checkin_60_done: "60-Day Check-in Complete",
    cycle_complete: "Cycle Complete",
    cycle_superseded: "Cycle Incomplete",
  };
  return map[status] ?? status;
}

export function getStatusColor(status: ReviewCycleStatus): string {
  if (status.includes("past_due")) return "text-red-600 bg-red-50";
  if (status.includes("late")) return "text-orange-600 bg-orange-50";
  if (status.includes("due") || status.includes("pending")) return "text-yellow-700 bg-yellow-50";
  if (status.includes("submitted") || status.includes("done") || status.includes("complete") || status === "approved" || status === "completed" || status === "cycle_complete") return "text-green-700 bg-green-50";
  if (status === "rejected" || status === "cycle_superseded") return "text-red-700 bg-red-50";
  return "text-gray-600 bg-gray-50";
}

/** Per-stage status for the review cycle table */
export interface StageStatuses {
  selfReview: string;
  managerReview: string;
  directorReview: string;
  finalReview: string;
  checkin30: string;
  checkin60: string;
}

function hasMeaningfulResponses(responses: QuestionResponse[] | undefined): boolean {
  return Boolean(responses?.some((r) => String(r.answer ?? "").trim().length > 0));
}

/**
 * Stage badges for past detail when the cycle was superseded (schedule continued).
 * Uses snapshot + cycle fields instead of mapping superseded → all Complete.
 */
export function getStageStatusesFromSnapshot(snapshot: ReviewCycleSnapshot): StageStatuses {
  const na = "—";
  const cycle = snapshot.cycle;
  const status = cycle.status;

  const selfDone =
    Boolean(snapshot.selfReview?.submittedAt) || hasMeaningfulResponses(snapshot.selfReview?.responses);
  const selfReview = selfDone ? "Complete" : "Not started";

  const mgr = snapshot.managerReview;
  const mgrDone =
    Boolean(mgr?.submittedAt) ||
    hasMeaningfulResponses(mgr?.responses) ||
    Boolean(mgr?.revisionHistory?.some((h) => hasMeaningfulResponses(h.responses)));

  let managerReview: string;
  if (!selfDone) managerReview = na;
  else if (mgrDone) managerReview = "Complete";
  else managerReview = "Not started";

  let directorReview: string = na;
  if (cycle.directorDecision === "approved") directorReview = "Approved";
  else if (cycle.directorDecision === "rejected") directorReview = "Rejected";
  else if (mgrDone) directorReview = "Due";

  let finalReview: string = na;
  if (cycle.directorDecision === "approved") {
    if (
      status === "completed" ||
      status === "cycle_complete" ||
      status === "checkin_30_complete" ||
      status === "checkin_30_done" ||
      status === "checkin_60_complete" ||
      status === "checkin_60_done"
    ) {
      finalReview = "Complete";
    } else if (status === "sharing_due") finalReview = "Due";
    else if (status === "sharing_pending") finalReview = "Pending";
    else if (status === "sharing_past_due") finalReview = "Past due";
    else if (status === "cycle_superseded") finalReview = "Not complete";
    else if (status === "approved") finalReview = "Due";
  }

  const checkinForPeriod = (period: "30" | "60"): string => {
    const ci = snapshot.checkIns?.find((c) => String(c.period) === period);
    return ci?.submittedAt ? "Complete" : na;
  };

  return {
    selfReview,
    managerReview,
    directorReview,
    finalReview,
    checkin30: checkinForPeriod("30"),
    checkin60: checkinForPeriod("60"),
  };
}

/** Map overall cycle status to a status label for each stage. */
export function getStageStatuses(status: ReviewCycleStatus): StageStatuses {
  const na = "—";
  const complete = "Complete";
  const done = "Complete";

  /** Superseded cycles are not “fully complete”; per-stage truth comes from detail snapshot. */
  if (status === "cycle_superseded") {
    return {
      selfReview: na,
      managerReview: na,
      directorReview: na,
      finalReview: na,
      checkin30: na,
      checkin60: na,
    };
  }

  const self = (): string => {
    switch (status) {
      case "upcoming": return "Upcoming";
      case "notification_sent_75": return "75-Day Notice Sent";
      case "form_available_85": return "Form Available";
      case "self_review_due": return "Due";
      case "self_review_late": return "Late";
      case "self_review_past_due": return "Past due";
      case "self_review_submitted":
      case "manager_review_due":
      case "manager_review_pending":
      case "manager_review_past_due":
      case "manager_review_submitted":
      case "director_approval_due":
      case "director_approval_pending":
      case "director_approval_past_due":
      case "approved":
      case "rejected":
      case "sharing_due":
      case "sharing_pending":
      case "sharing_past_due":
      case "completed":
      case "checkin_30_due":
      case "checkin_30_past_due":
      case "checkin_30_complete":
      case "checkin_30_done":
      case "checkin_60_due":
      case "checkin_60_past_due":
      case "checkin_60_complete":
      case "checkin_60_done":
      case "cycle_complete":
        return complete;
      default: return na;
    }
  };

  const manager = (): string => {
    switch (status) {
      case "upcoming":
      case "notification_sent_75":
      case "form_available_85":
      case "self_review_due":
      case "self_review_late":
      case "self_review_past_due":
        return na;
      case "self_review_submitted":
      case "manager_review_due":
      case "manager_review_pending": return "Due";
      case "manager_review_past_due": return "Past due";
      case "manager_review_submitted":
      case "director_approval_due":
      case "director_approval_pending":
      case "director_approval_past_due":
      case "approved":
      case "rejected":
      case "sharing_due":
      case "sharing_pending":
      case "sharing_past_due":
      case "completed":
      case "checkin_30_due":
      case "checkin_30_past_due":
      case "checkin_30_complete":
      case "checkin_30_done":
      case "checkin_60_due":
      case "checkin_60_past_due":
      case "checkin_60_complete":
      case "checkin_60_done":
      case "cycle_complete":
      case "cycle_superseded":
        return complete;
      default: return na;
    }
  };

  const director = (): string => {
    switch (status) {
      case "upcoming":
      case "notification_sent_75":
      case "form_available_85":
      case "self_review_due":
      case "self_review_late":
      case "self_review_past_due":
      case "self_review_submitted":
      case "manager_review_due":
      case "manager_review_pending":
      case "manager_review_past_due":
        return na;
      case "manager_review_submitted":
      case "director_approval_due":
      case "director_approval_pending": return "Due";
      case "director_approval_past_due": return "Past due";
      case "approved": return "Approved";
      case "rejected": return "Rejected";
      case "sharing_due":
      case "sharing_pending":
      case "sharing_past_due":
      case "completed":
      case "checkin_30_due":
      case "checkin_30_past_due":
      case "checkin_30_complete":
      case "checkin_30_done":
      case "checkin_60_due":
      case "checkin_60_past_due":
      case "checkin_60_complete":
      case "checkin_60_done":
      case "cycle_complete":
        return complete;
      default: return na;
    }
  };

  const final = (): string => {
    switch (status) {
      case "upcoming":
      case "notification_sent_75":
      case "form_available_85":
      case "self_review_due":
      case "self_review_late":
      case "self_review_past_due":
      case "self_review_submitted":
      case "manager_review_due":
      case "manager_review_pending":
      case "manager_review_past_due":
      case "manager_review_submitted":
      case "director_approval_due":
      case "director_approval_pending":
      case "director_approval_past_due":
      case "rejected":
        return na;
      case "approved":
      case "sharing_due":
      case "sharing_pending": return "Due";
      case "sharing_past_due": return "Past due";
      case "completed":
      case "checkin_30_due":
      case "checkin_30_past_due":
      case "checkin_30_complete":
      case "checkin_30_done":
      case "checkin_60_due":
      case "checkin_60_past_due":
      case "checkin_60_complete":
      case "checkin_60_done":
      case "cycle_complete":
        return complete;
      default: return na;
    }
  };

  const c30 = (): string => {
    switch (status) {
      case "upcoming":
      case "notification_sent_75":
      case "form_available_85":
      case "self_review_due":
      case "self_review_late":
      case "self_review_past_due":
      case "self_review_submitted":
      case "manager_review_due":
      case "manager_review_pending":
      case "manager_review_past_due":
      case "manager_review_submitted":
      case "director_approval_due":
      case "director_approval_pending":
      case "director_approval_past_due":
      case "approved":
      case "rejected":
      case "sharing_due":
      case "sharing_pending":
      case "sharing_past_due":
      case "completed":
        return na;
      case "checkin_30_due": return "Due";
      case "checkin_30_past_due": return "Past due";
      case "checkin_30_complete":
      case "checkin_30_done":
      case "checkin_60_due":
      case "checkin_60_past_due":
      case "checkin_60_complete":
      case "checkin_60_done":
      case "cycle_complete":
        return done;
      default: return na;
    }
  };

  const c60 = (): string => {
    switch (status) {
      case "upcoming":
      case "notification_sent_75":
      case "form_available_85":
      case "self_review_due":
      case "self_review_late":
      case "self_review_past_due":
      case "self_review_submitted":
      case "manager_review_due":
      case "manager_review_pending":
      case "manager_review_past_due":
      case "manager_review_submitted":
      case "director_approval_due":
      case "director_approval_pending":
      case "director_approval_past_due":
      case "approved":
      case "rejected":
      case "sharing_due":
      case "sharing_pending":
      case "sharing_past_due":
      case "completed":
      case "checkin_30_due":
      case "checkin_30_past_due":
      case "checkin_30_complete":
      case "checkin_30_done":
        return na;
      case "checkin_60_due": return "Due";
      case "checkin_60_past_due": return "Past due";
      case "checkin_60_complete":
      case "checkin_60_done":
      case "cycle_complete":
        return done;
      default: return na;
    }
  };

  return {
    selfReview: self(),
    managerReview: manager(),
    directorReview: director(),
    finalReview: final(),
    checkin30: c30(),
    checkin60: c60(),
  };
}

/** Tailwind class for a stage status badge (e.g. Due, Past due, Complete). */
export function getStageStatusColor(stageLabel: string): string {
  if (stageLabel === "—") return "text-gray-500 bg-gray-100";
  if (stageLabel === "Not started") return "text-gray-600 bg-gray-100";
  if (stageLabel === "Not complete") return "text-amber-800 bg-amber-50";
  if (stageLabel === "Past due" || stageLabel === "Late" || stageLabel === "Rejected") return "text-red-600 bg-red-50";
  if (stageLabel === "Due" || stageLabel === "Pending" || stageLabel === "Form Available" || stageLabel === "Upcoming" || stageLabel === "75-Day Notice Sent") return "text-yellow-700 bg-yellow-50";
  if (stageLabel === "Complete" || stageLabel === "Done" || stageLabel === "Approved") return "text-green-700 bg-green-50";
  return "text-gray-600 bg-gray-50";
}

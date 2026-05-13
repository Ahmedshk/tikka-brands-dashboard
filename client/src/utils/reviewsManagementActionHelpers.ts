import type { ReviewCycle, ReviewCycleStatus } from "../types/review.types";

type ModalType =
  | { kind: "self-review"; cycle: ReviewCycle }
  | { kind: "manager-review"; cycle: ReviewCycle }
  | { kind: "director-approval"; cycle: ReviewCycle }
  | { kind: "sharing"; cycle: ReviewCycle }
  | { kind: "checkin"; cycle: ReviewCycle; period: "30" | "60" };

const SELF_REVIEW_STATUSES = new Set<ReviewCycleStatus>([
  "form_available_85",
  "self_review_due",
  "self_review_late",
  "self_review_past_due",
]);
const MANAGER_REVIEW_STATUSES = new Set<ReviewCycleStatus>([
  "self_review_submitted",
  "manager_review_due",
  "manager_review_pending",
  "manager_review_past_due",
]);
const DIRECTOR_STATUSES = new Set<ReviewCycleStatus>([
  "manager_review_submitted",
  "director_approval_due",
  "director_approval_pending",
  "director_approval_past_due",
]);
const SHARING_STATUSES = new Set<ReviewCycleStatus>([
  "approved",
  "sharing_due",
  "sharing_pending",
  "sharing_past_due",
]);
const CHECKIN_30_STATUSES = new Set<ReviewCycleStatus>([
  "checkin_30_due",
  "checkin_30_past_due",
]);
const CHECKIN_60_STATUSES = new Set<ReviewCycleStatus>([
  "checkin_60_due",
  "checkin_60_past_due",
]);

export type ReviewsManagementActionResult =
  | { type: "modal"; modal: ModalType }
  | { type: "toast"; message: string };

export function getReviewsManagementAction(args: {
  cycle: ReviewCycle;
  isEmployee: boolean;
  isManager: boolean;
  isDirector: boolean;
}): ReviewsManagementActionResult {
  const { cycle, isEmployee, isManager, isDirector } = args;
  const s = cycle.status;

  if (isEmployee && SELF_REVIEW_STATUSES.has(s)) {
    return { type: "modal", modal: { kind: "self-review", cycle } };
  }
  if (isManager && MANAGER_REVIEW_STATUSES.has(s)) {
    return { type: "modal", modal: { kind: "manager-review", cycle } };
  }
  if (isDirector && DIRECTOR_STATUSES.has(s)) {
    return { type: "modal", modal: { kind: "director-approval", cycle } };
  }
  if (isManager && SHARING_STATUSES.has(s)) {
    return { type: "modal", modal: { kind: "sharing", cycle } };
  }
  if (isManager && CHECKIN_30_STATUSES.has(s)) {
    return { type: "modal", modal: { kind: "checkin", cycle, period: "30" } };
  }
  if (isManager && CHECKIN_60_STATUSES.has(s)) {
    return { type: "modal", modal: { kind: "checkin", cycle, period: "60" } };
  }
  if (
    isManager &&
    (s === "upcoming" || s === "notification_sent_75" || s === "form_available_85")
  ) {
    return { type: "toast", message: "Waiting for employee to complete self-review" };
  }
  return { type: "toast", message: "No action available for this status" };
}


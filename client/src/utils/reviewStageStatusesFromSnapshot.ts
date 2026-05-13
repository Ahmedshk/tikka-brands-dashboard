import type {
  QuestionResponse,
  ReviewCycle,
  ReviewCycleSnapshot,
  ReviewCycleStatus,
  StageStatuses,
} from "../types/review.types";

function hasMeaningfulResponses(responses: QuestionResponse[] | undefined): boolean {
  return Boolean(responses?.some((r) => String(r.answer ?? "").trim().length > 0));
}

function isSelfDone(snapshot: ReviewCycleSnapshot): boolean {
  return (
    Boolean(snapshot.selfReview?.submittedAt) ||
    hasMeaningfulResponses(snapshot.selfReview?.responses)
  );
}

function isManagerDone(snapshot: ReviewCycleSnapshot): boolean {
  const mgr = snapshot.managerReview;
  return (
    Boolean(mgr?.submittedAt) ||
    hasMeaningfulResponses(mgr?.responses) ||
    Boolean(mgr?.revisionHistory?.some((h) => hasMeaningfulResponses(h.responses)))
  );
}

function getDirectorReviewLabel(cycle: ReviewCycle, managerDone: boolean): string {
  if (cycle.directorDecision === "approved") return "Approved";

  if (cycle.directorDecision === "rejected") {
    const revisionsRequestedStatuses: ReviewCycleStatus[] = [
      "manager_review_due",
      "manager_review_pending",
      "manager_review_past_due",
    ];
    return revisionsRequestedStatuses.includes(cycle.status)
      ? "Revisions requested"
      : "Rejected";
  }

  return managerDone ? "Due" : "—";
}

function getFinalReviewLabel(status: ReviewCycleStatus, directorDecision: ReviewCycle["directorDecision"]): string {
  if (directorDecision !== "approved") return "—";

  const completeStatuses = new Set<ReviewCycleStatus>([
    "completed",
    "cycle_complete",
    "checkin_30_complete",
    "checkin_30_done",
    "checkin_60_complete",
    "checkin_60_done",
  ]);
  if (completeStatuses.has(status)) return "Complete";

  const approvedStatusToLabel: Partial<Record<ReviewCycleStatus, string>> = {
    sharing_due: "Due",
    sharing_pending: "Pending",
    sharing_past_due: "Past due",
    cycle_superseded: "Not complete",
    approved: "Due",
  };

  return approvedStatusToLabel[status] ?? "—";
}

function getCheckinForPeriod(snapshot: ReviewCycleSnapshot, period: "30" | "60"): string {
  const ci = snapshot.checkIns?.find((c) => String(c.period) === period);
  return ci?.submittedAt ? "Complete" : "—";
}

export function getStageStatusesFromSnapshotImpl(snapshot: ReviewCycleSnapshot): StageStatuses {
  const selfDone = isSelfDone(snapshot);
  const managerDone = isManagerDone(snapshot);

  const selfReview = selfDone ? "Complete" : "Not started";
  let managerReview = "—";
  if (selfDone) {
    managerReview = managerDone ? "Complete" : "Not started";
  }

  return {
    selfReview,
    managerReview,
    directorReview: getDirectorReviewLabel(snapshot.cycle, managerDone),
    finalReview: getFinalReviewLabel(snapshot.cycle.status, snapshot.cycle.directorDecision),
    checkin30: getCheckinForPeriod(snapshot, "30"),
    checkin60: getCheckinForPeriod(snapshot, "60"),
  };
}


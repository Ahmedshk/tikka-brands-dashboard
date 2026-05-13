import { Types } from "mongoose";
import { ReviewCycleModel } from "../models/reviewCycle.model.js";
import type { NotificationService } from "../services/notification.service.js";
import type { ReviewCycleService } from "../services/reviewCycle.service.js";
import type { ReviewCycleStatus } from "../types/reviewCycle.types.js";
import { diffPeriod, MANAGER_DEADLINE } from "./reviewTimings.js";

type LeanPopulatedCycle = {
  _id: unknown;
  employeeId: { toString(): string };
  status: string;
  selfReviewId?: unknown;
  reviewedByManagerId?: { toString(): string } | null;
  directorRejectedAt?: Date;
};

function cycleIdStringFromObjectId(cycleObjectId: Types.ObjectId): string {
  return cycleObjectId.toString();
}

function getAnchorStart(selfSubmitted: Date, rejectedAt: Date | undefined): Date {
  if (!rejectedAt) return selfSubmitted;
  return new Date(Math.max(selfSubmitted.getTime(), new Date(rejectedAt).getTime()));
}

function getSubmittedAtFromSelfReview(selfReviewId: unknown): Date | null {
  const selfReview = selfReviewId as { submittedAt?: Date } | undefined;
  return selfReview?.submittedAt ?? null;
}

function shouldTransitionToPastDue(args: {
  now: Date;
  submittedAt: Date;
  rejectedAt: Date | undefined;
  status: string;
}): boolean {
  const { now, submittedAt, rejectedAt, status } = args;
  const anchorStart = getAnchorStart(submittedAt, rejectedAt);
  const unitsSinceSubmission = diffPeriod(now, anchorStart);
  const isDeadlineStatus = status === "manager_review_due" || status === "manager_review_pending";
  return isDeadlineStatus && unitsSinceSubmission >= MANAGER_DEADLINE;
}

async function resolveManagerId(args: {
  employeeId: string;
  reviewedByManagerId: { toString(): string } | null | undefined;
  reviewCycleService: ReviewCycleService;
}): Promise<string | null> {
  const { employeeId, reviewedByManagerId, reviewCycleService } = args;
  if (reviewedByManagerId) return reviewedByManagerId.toString();
  return await reviewCycleService.getManagerForEmployee(employeeId);
}

async function markManagerReviewPastDue(args: {
  cycleObjectId: Types.ObjectId;
  managerId: string | null;
  alreadyHasManagerId: boolean;
}): Promise<void> {
  const { cycleObjectId, managerId, alreadyHasManagerId } = args;
  const setFields: { status: ReviewCycleStatus; reviewedByManagerId?: Types.ObjectId } = {
    status: "manager_review_past_due",
  };
  if (!alreadyHasManagerId && managerId) {
    setFields.reviewedByManagerId = new Types.ObjectId(managerId);
  }
  await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: setFields });
}

async function sendManagerPastDueNotification(args: {
  managerId: string;
  employeeId: string;
  cycleId: string;
  clientUrl: string;
  notificationService: NotificationService;
  reviewNotificationData: (employeeId: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getEmployeeFirstName: (employeeId: string) => Promise<string>;
}): Promise<void> {
  const {
    managerId,
    employeeId,
    cycleId,
    clientUrl,
    notificationService,
    reviewNotificationData,
    getEmployeeFirstName,
  } = args;

  const actionUrl = `${clientUrl}/dashboard/reviews-management`;
  await notificationService.send({
    recipientId: managerId,
    type: "review_manager_past_due",
    title: "Manager Review Past Due",
    message: "Your employee review is past the 5-day deadline. Please complete it immediately.",
    data: await reviewNotificationData(employeeId, { reviewCycleId: cycleId }),
    channels: ["all"],
    actionUrl,
    emailTemplateFile: "review-email.ejs",
    emailTemplateData: { actionUrl, firstName: await getEmployeeFirstName(managerId) },
    emailButtonText: "View",
  });
}

export async function runReviewCheckManagerDeadlineJob(args: {
  now: Date;
  clientUrl: string;
  reviewCycleService: ReviewCycleService;
  notificationService: NotificationService;
  cancelCycleIfTerminated: (cycleId: unknown, employeeId: string) => Promise<boolean>;
  asObjectId: (id: unknown) => Types.ObjectId | null;
  getEmployeeFirstName: (employeeId: string) => Promise<string>;
  reviewNotificationData: (employeeId: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
}): Promise<void> {
  const {
    now,
    clientUrl,
    reviewCycleService,
    notificationService,
    cancelCycleIfTerminated,
    asObjectId,
    getEmployeeFirstName,
    reviewNotificationData,
    logger,
  } = args;

  logger.info("Job: review:check-manager-deadline - running");

  const cycles = (await ReviewCycleModel.find({
    status: { $in: ["manager_review_due", "manager_review_pending", "manager_review_past_due"] },
    selfReviewId: { $ne: null },
  })
    .populate("selfReviewId", "submittedAt")
    .lean()) as LeanPopulatedCycle[];

  for (const cycle of cycles) {
    const employeeId = cycle.employeeId.toString();
    if (await cancelCycleIfTerminated(cycle._id, employeeId)) continue;

    const cycleObjectId = asObjectId(cycle._id);
    if (!cycleObjectId) continue;
    const cycleId = cycleIdStringFromObjectId(cycleObjectId);

    const submittedAt = getSubmittedAtFromSelfReview(cycle.selfReviewId);
    if (!submittedAt) continue;

    if (
      !shouldTransitionToPastDue({
        now,
        submittedAt,
        rejectedAt: cycle.directorRejectedAt,
        status: cycle.status,
      })
    ) {
      continue;
    }

    const managerId = await resolveManagerId({
      employeeId,
      reviewedByManagerId: cycle.reviewedByManagerId ?? null,
      reviewCycleService,
    });

    if (!managerId) {
      logger.warn("review:check-manager-deadline: past due but no manager to notify", {
        cycleId,
        employeeId,
      });
      continue;
    }

    await markManagerReviewPastDue({
      cycleObjectId,
      managerId,
      alreadyHasManagerId: Boolean(cycle.reviewedByManagerId),
    });

    await sendManagerPastDueNotification({
      managerId,
      employeeId,
      cycleId,
      clientUrl,
      notificationService,
      reviewNotificationData,
      getEmployeeFirstName,
    });
  }
}


import type { Agenda } from "agenda";
import { Types } from "mongoose";
import { ReviewCycleModel } from "../models/reviewCycle.model.js";
import { UserModel } from "../models/user.model.js";
import { NotificationService } from "../services/notification.service.js";
import { ReviewCycleService } from "../services/reviewCycle.service.js";
import { logger } from "../utils/logger.util.js";
import {
  addPeriod, diffPeriod,
  LATE_AFTER_DUE, PAST_DUE_AFTER_DUE, DIRECTOR_DEADLINE, SHARING_DEADLINE,
  getCheckin30, getCheckin30PastDue, getCheckin60, getCheckin60PastDue,
} from "../utils/reviewTimings.js";
import type { ReviewCycleStatus } from "../types/reviewCycle.types.js";
import { runReviewCheckManagerDeadlineJob } from "../utils/reviewCycleJobsManagerDeadline.util.js";

const notificationService = new NotificationService();
const reviewCycleService = new ReviewCycleService();

const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

function asObjectId(id: unknown): Types.ObjectId | null {
  if (id instanceof Types.ObjectId) return id;
  if (typeof id === "string" && Types.ObjectId.isValid(id)) return new Types.ObjectId(id);
  if (id != null && typeof (id as { toString?: unknown }).toString === "function") {
    const s = (id as { toString(): string }).toString();
    if (Types.ObjectId.isValid(s)) return new Types.ObjectId(s);
  }
  return null;
}

async function getSelfReviewActionUrl(cycleId: unknown): Promise<string> {
  const cycle = await ReviewCycleModel.findById(cycleId)
    .select("dueDate90 selfReviewToken selfReviewTokenExpiresAt selfReviewId status")
    .lean();
  if (!cycle) return `${CLIENT_URL}/dashboard/reviews-management`;
  const token = await reviewCycleService.ensureSelfReviewToken(cycle);
  return token ? `${CLIENT_URL}/self-review?token=${encodeURIComponent(token)}` : `${CLIENT_URL}/dashboard/reviews-management`;
}

async function isEmployeeTerminated(employeeId: string): Promise<boolean> {
  const user = await UserModel.findById(employeeId).select("isTerminated").lean();
  return user?.isTerminated === true;
}

async function cancelCycleIfTerminated(cycleId: unknown, employeeId: string): Promise<boolean> {
  if (!(await isEmployeeTerminated(employeeId))) return false;
  const _id = asObjectId(cycleId);
  if (!_id) return false;
  await ReviewCycleModel.updateOne({ _id }, { $set: { status: "cycle_complete" } });
  return true;
}

async function getEmployeeFirstName(employeeId: string): Promise<string> {
  const user = await UserModel.findById(employeeId).select("firstName").lean();
  return (user as { firstName?: string } | null)?.firstName ?? "";
}

async function reviewNotificationData(
  employeeId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const locationId = await reviewCycleService.getNotificationLocationIdForEmployee(employeeId);
  return locationId ? { ...data, locationId } : { ...data };
}

async function processMilestone(
  cycle: { _id: unknown; employeeId: { toString(): string }; status: string; formAvailableDate85: Date; notifyDate75: Date; dueDate90: Date },
  now: Date,
): Promise<void> {
  const employeeId = cycle.employeeId.toString();
  const cycleObjectId = asObjectId(cycle._id);
  if (!cycleObjectId) {
    logger.warn("review:check-milestones - invalid cycle id", { employeeId });
    return;
  }
  const cycleId = (cycle._id as { toString(): string }).toString();
  const firstName = await getEmployeeFirstName(employeeId);

  const sendSelfReviewNotification = async (
    actionUrl: string,
    type: "review_self_available" | "review_self_due" | "review_self_late" | "review_self_past_due",
    title: string,
    message: string,
    buttonText: string,
  ) => {
    await notificationService.send({
      recipientId: employeeId,
      type,
      title,
      message,
      data: await reviewNotificationData(employeeId, { reviewCycleId: cycleId }),
      channels: ["all"],
      actionUrl,
      emailTemplateFile: "review-email.ejs",
      emailTemplateData: { firstName, actionUrl },
      emailButtonText: buttonText,
    });
  };

  if (cycle.status === "upcoming" && now >= cycle.notifyDate75) {
    await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "notification_sent_75" } });
    await notificationService.send({
      recipientId: employeeId,
      type: "review_self_upcoming",
      title: "Self-Review Period Approaching",
      message: "Your self-review window is approaching. You will receive another email when the form is available.",
      data: await reviewNotificationData(employeeId, { reviewCycleId: cycleId }),
      channels: ["all"],
      emailTemplateFile: "review-email.ejs",
      emailTemplateData: { firstName },
    });
    return;
  }

  if (cycle.status === "notification_sent_75" && now >= cycle.formAvailableDate85) {
    await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "form_available_85" } });
    const actionUrl = await getSelfReviewActionUrl(cycle._id);
    await sendSelfReviewNotification(
      actionUrl,
      "review_self_available",
      "Self-Review Form Available",
      "Your self-review form is now available. Please complete it before the due date.",
      "Complete self-review",
    );
    return;
  }

  if (cycle.status === "form_available_85" && now >= cycle.dueDate90) {
    await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "self_review_due" } });
    const actionUrl = await getSelfReviewActionUrl(cycle._id);
    await sendSelfReviewNotification(
      actionUrl,
      "review_self_due",
      "Self-Review Due Today",
      "Your self-review is due today. Please submit it as soon as possible.",
      "Complete self-review",
    );
    return;
  }

  if (cycle.status === "self_review_due" && now >= addPeriod(cycle.dueDate90, LATE_AFTER_DUE)) {
    await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "self_review_late" } });
    const actionUrl = await getSelfReviewActionUrl(cycle._id);
    await sendSelfReviewNotification(
      actionUrl,
      "review_self_late",
      "Self-Review Late",
      "Your self-review is 1 day late. Please submit it immediately.",
      "Complete self-review",
    );
    return;
  }

  if (cycle.status === "self_review_late" && now >= addPeriod(cycle.dueDate90, PAST_DUE_AFTER_DUE)) {
    await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "self_review_past_due" } });
    const actionUrl = await getSelfReviewActionUrl(cycle._id);
    await sendSelfReviewNotification(
      actionUrl,
      "review_self_past_due",
      "Self-Review Past Due",
      "Your self-review is past due. This is your final reminder.",
      "Complete self-review",
    );
  }
}

async function processCheckInCycle(
  cycle: { _id: unknown; employeeId: { toString(): string }; status: string; completedAt?: Date | null; reviewedByManagerId?: { toString(): string } | null },
  now: Date,
): Promise<void> {
  if (!cycle.completedAt) return;
  const cycleObjectId = asObjectId(cycle._id);
  if (!cycleObjectId) return;
  const unitsSinceComplete = diffPeriod(now, cycle.completedAt);
  const cycleId = (cycle._id as { toString(): string }).toString();
  const managerId = cycle.reviewedByManagerId?.toString();

  const subjectEmployeeId = cycle.employeeId.toString();

  if (cycle.status === "completed" && unitsSinceComplete >= getCheckin30()) {
    await transitionCheckIn(cycleId, "checkin_30_due", managerId, subjectEmployeeId);
    return;
  }

  const dashboardUrl = `${CLIENT_URL}/dashboard/reviews-management`;

  if (cycle.status === "checkin_30_due" && unitsSinceComplete >= getCheckin30PastDue()) {
    await ReviewCycleModel.updateOne(
      { _id: cycleObjectId },
      { $set: { status: "checkin_30_past_due" as ReviewCycleStatus } },
    );
    if (managerId) {
      await notificationService.send({
        recipientId: managerId,
        type: "review_checkin_past_due",
        title: "30-Day Check-in Past Due",
        message: "The 30-day check-in is past the 5-day completion window.",
        data: await reviewNotificationData(subjectEmployeeId, { reviewCycleId: cycleId, period: "30" }),
        channels: ["all"],
        actionUrl: dashboardUrl,
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { actionUrl: dashboardUrl, firstName: await getEmployeeFirstName(managerId) },
        emailButtonText: "View",
      });
    }
    return;
  }

  if ((cycle.status === "checkin_30_complete" || cycle.status === "checkin_30_done") && unitsSinceComplete >= getCheckin60()) {
    await transitionCheckIn(cycleId, "checkin_60_due", managerId, subjectEmployeeId);
    return;
  }

  if (cycle.status === "checkin_60_due" && unitsSinceComplete >= getCheckin60PastDue()) {
    await ReviewCycleModel.updateOne(
      { _id: cycleObjectId },
      { $set: { status: "checkin_60_past_due" as ReviewCycleStatus } },
    );
    if (managerId) {
      await notificationService.send({
        recipientId: managerId,
        type: "review_checkin_past_due",
        title: "60-Day Check-in Past Due",
        message: "The 60-day check-in is past the 5-day completion window.",
        data: await reviewNotificationData(subjectEmployeeId, { reviewCycleId: cycleId, period: "60" }),
        channels: ["all"],
        actionUrl: dashboardUrl,
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { actionUrl: dashboardUrl, firstName: await getEmployeeFirstName(managerId) },
        emailButtonText: "View",
      });
    }
  }
}

export function registerReviewCycleJobs(agenda: Agenda): void {
  agenda.define("review:check-milestones", async (_job) => {
    const now = new Date();
    logger.info("Job: review:check-milestones - running");

    const cycles = await ReviewCycleModel.find({
      status: { $in: ["upcoming", "notification_sent_75", "form_available_85", "self_review_due", "self_review_late"] },
    }).lean();

    for (const cycle of cycles) {
      const cycleId = (cycle._id as { toString(): string }).toString();
      try {
        if (await cancelCycleIfTerminated(cycle._id, cycle.employeeId.toString())) continue;
        await processMilestone(cycle, now);
      } catch (err) {
        logger.error("review:check-milestones error for cycle", { cycleId, err });
      }
    }
  });

  agenda.define("review:check-manager-deadline", async (_job) => {
    await runReviewCheckManagerDeadlineJob({
      now: new Date(),
      clientUrl: CLIENT_URL,
      reviewCycleService,
      notificationService,
      cancelCycleIfTerminated,
      asObjectId,
      getEmployeeFirstName,
      reviewNotificationData,
      logger,
    });
  });

  agenda.define("review:check-director-deadline", async (_job) => {
    const now = new Date();
    logger.info("Job: review:check-director-deadline - running");

    const cycles = await ReviewCycleModel.find({
      status: { $in: ["director_approval_due", "director_approval_pending", "director_approval_past_due"] },
      managerReviewId: { $ne: null },
    })
      .populate("managerReviewId", "submittedAt")
      .lean();

    for (const cycle of cycles) {
      if (await cancelCycleIfTerminated(cycle._id, cycle.employeeId.toString())) continue;
      const cycleObjectId = asObjectId(cycle._id);
      if (!cycleObjectId) continue;

      const mgrReview = cycle.managerReviewId as unknown as { submittedAt: Date } | undefined;
      if (!mgrReview?.submittedAt) continue;

      const c = cycle as typeof cycle & { directorApprovalStartedAt?: Date };
      const deadlineStart = c.directorApprovalStartedAt
        ? new Date(c.directorApprovalStartedAt)
        : new Date(mgrReview.submittedAt);

      const unitsSince = diffPeriod(now, deadlineStart);
      if (unitsSince >= DIRECTOR_DEADLINE && (cycle.status === "director_approval_due" || cycle.status === "director_approval_pending")) {
        await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "director_approval_past_due" } });
        if (cycle.approvedByDirectorId) {
          const directorId = cycle.approvedByDirectorId.toString();
          const actionUrl = `${CLIENT_URL}/dashboard/reviews-management`;
          await notificationService.send({
            recipientId: directorId,
            type: "review_director_past_due",
            title: "Director Approval Past Due",
            message: "A review is awaiting your approval and has exceeded the 3-day deadline.",
            data: await reviewNotificationData(cycle.employeeId.toString(), { reviewCycleId: cycle._id.toString() }),
            channels: ["all"],
            actionUrl,
            emailTemplateFile: "review-email.ejs",
            emailTemplateData: { actionUrl, firstName: await getEmployeeFirstName(directorId) },
            emailButtonText: "View",
          });
        }
      }
    }
  });

  agenda.define("review:check-sharing-deadline", async (_job) => {
    const now = new Date();
    logger.info("Job: review:check-sharing-deadline - running");

    const cycles = await ReviewCycleModel.find({
      status: { $in: ["sharing_due", "sharing_pending", "sharing_past_due", "approved"] },
      directorDecision: "approved",
    }).lean();

    for (const cycle of cycles) {
      if (await cancelCycleIfTerminated(cycle._id, cycle.employeeId.toString())) continue;
      const cycleObjectId = asObjectId(cycle._id);
      if (!cycleObjectId) continue;

      if (cycle.status === "approved") {
        await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "sharing_due" } });
        continue;
      }

      const approvedAt = cycle.updatedAt;
      const unitsSince = diffPeriod(now, approvedAt);
      if (unitsSince >= SHARING_DEADLINE && (cycle.status === "sharing_due" || cycle.status === "sharing_pending")) {
        await ReviewCycleModel.updateOne({ _id: cycleObjectId }, { $set: { status: "sharing_past_due" } });
        if (cycle.reviewedByManagerId) {
          const managerId = cycle.reviewedByManagerId.toString();
          const actionUrl = `${CLIENT_URL}/dashboard/reviews-management`;
          await notificationService.send({
            recipientId: managerId,
            type: "review_sharing_past_due",
            title: "Review Sharing Past Due",
            message: "Sharing the review with the employee is past the 3-day deadline.",
            data: await reviewNotificationData(cycle.employeeId.toString(), { reviewCycleId: cycle._id.toString() }),
            channels: ["all"],
            actionUrl,
            emailTemplateFile: "review-email.ejs",
            emailTemplateData: { actionUrl, firstName: await getEmployeeFirstName(managerId) },
            emailButtonText: "View",
          });
        }
      }
    }
  });

  agenda.define("review:supersede-scheduled", async (_job) => {
    logger.info("Job: review:supersede-scheduled - running");
    try {
      const n = await reviewCycleService.supersedeStaleScheduledCycles();
      if (n > 0) logger.info("Job: review:supersede-scheduled - superseded cycles", { count: n });
    } catch (err) {
      logger.error("Job: review:supersede-scheduled error", { err });
    }
  });

  agenda.define("review:check-checkin-deadlines", async (_job) => {
    const now = new Date();
    logger.info("Job: review:check-checkin-deadlines - running");

    const completedCycles = await ReviewCycleModel.find({
      status: { $in: ["completed", "checkin_30_due", "checkin_30_past_due", "checkin_30_complete", "checkin_30_done", "checkin_60_due", "checkin_60_past_due"] },
      completedAt: { $ne: null },
    }).lean();

    for (const cycle of completedCycles) {
      try {
        if (await cancelCycleIfTerminated(cycle._id, cycle.employeeId.toString())) continue;
        await processCheckInCycle(cycle, now);
      } catch (err) {
        logger.error("review:check-checkin-deadlines error", { cycleId: cycle._id.toString(), err });
      }
    }
  });
}

async function transitionCheckIn(
  cycleId: string,
  status: ReviewCycleStatus,
  managerId: string | undefined,
  employeeId: string,
): Promise<void> {
  const _id = asObjectId(cycleId);
  if (!_id) return;
  await ReviewCycleModel.updateOne({ _id }, { $set: { status } });
  if (managerId) {
    const period = status.includes("30") ? "30" : "60";
    const actionUrl = `${CLIENT_URL}/dashboard/reviews-management`;
    await notificationService.send({
      recipientId: managerId,
      type: "review_checkin_due",
      title: `${period}-Day Check-in Due`,
      message: `It's time for the ${period}-day employee check-in.`,
      data: await reviewNotificationData(employeeId, { reviewCycleId: cycleId, period }),
      channels: ["all"],
      actionUrl,
      emailTemplateFile: "review-email.ejs",
      emailTemplateData: { actionUrl, firstName: await getEmployeeFirstName(managerId) },
      emailButtonText: "View",
    });
  }
}

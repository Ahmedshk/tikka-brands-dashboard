import crypto from "node:crypto";
import { ReviewCycleModel } from "../models/reviewCycle.model.js";
import { SelfReviewModel } from "../models/selfReview.model.js";
import { ManagerReviewModel } from "../models/managerReview.model.js";
import { ActionPlanModel } from "../models/actionPlan.model.js";
import { CheckInModel } from "../models/checkIn.model.js";
import { ReviewSettingsModel } from "../models/reviewSettings.model.js";
import { UserModel } from "../models/user.model.js";
import { RoleModel } from "../models/role.model.js";
import { NotificationService } from "./notification.service.js";
import { AppError } from "../utils/errors.util.js";
import { logger } from "../utils/logger.util.js";
import { getDescendantRoleIds } from "../utils/roleHierarchy.util.js";
import {
  addPeriod, diffPeriod,
  CYCLE_LENGTH, getNotifyBeforeDue, FORM_BEFORE_DUE, NEXT_CYCLE_OFFSET, isTestMode,
  TEST_MODE_DUE_MINUTES_FROM_NOW,
} from "../utils/reviewTimings.js";
import type { HierarchyRole } from "../utils/roleHierarchy.util.js";
import type { ReviewCycleStatus, QuestionResponse } from "../types/reviewCycle.types.js";
import {
  REVIEW_CYCLE_TERMINAL_FOR_NEW_CYCLE,
  REVIEW_CYCLE_PAST_STATUSES,
} from "../types/reviewCycle.types.js";

const notificationService = new NotificationService();
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

/** Token expiry: 14 units after due date (14 days in prod, 14 min in test). */
const SELF_REVIEW_TOKEN_VALID_UNITS = 14;
/** If self-review is late/past due and not submitted, extend token from now (90 days in prod). */
const SELF_REVIEW_TOKEN_STALLED_UNITS = 90;

export class ReviewCycleService {
  /**
   * Calculate the next review reference date for an employee.
   * In test mode: due in 10 minutes so notifyDate75 is 9 minutes from now (1 minute before due).
   * In production: finds the nearest future 90-day multiple from their start date.
   */
  private computeNextReferenceDate(startDate: Date): Date {
    const now = new Date();
    if (isTestMode()) {
      return addPeriod(now, TEST_MODE_DUE_MINUTES_FROM_NOW);
    }
    const unitsSinceStart = diffPeriod(now, startDate);
    if (unitsSinceStart < 0) return startDate;
    const cyclesElapsed = Math.floor(unitsSinceStart / CYCLE_LENGTH);
    return addPeriod(startDate, (cyclesElapsed + 1) * CYCLE_LENGTH);
  }

  private computeDates(referenceDate: Date) {
    return {
      notifyDate75: addPeriod(referenceDate, getNotifyBeforeDue()),
      formAvailableDate85: addPeriod(referenceDate, FORM_BEFORE_DUE),
      dueDate90: referenceDate,
    };
  }

  /**
   * Ensure the cycle has a valid self-review token (generates and saves if missing or expired).
   * Returns the token for building the public self-review URL, or null if cycle already has selfReviewId.
   */
  async ensureSelfReviewToken(cycle: {
    _id: unknown;
    selfReviewToken?: string;
    selfReviewTokenExpiresAt?: Date;
    dueDate90: Date;
    selfReviewId?: unknown;
    status?: string;
  }): Promise<string | null> {
    if (cycle.selfReviewId) return null;
    const now = new Date();
    if (
      cycle.selfReviewToken &&
      cycle.selfReviewTokenExpiresAt &&
      cycle.selfReviewTokenExpiresAt > now
    ) {
      return cycle.selfReviewToken;
    }
    const status = cycle.status ?? "";
    const pastDue = now >= new Date(cycle.dueDate90);
    const useStalledExpiry =
      status === "self_review_late" ||
      status === "self_review_past_due" ||
      (status === "self_review_due" && pastDue);
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = useStalledExpiry
      ? addPeriod(now, SELF_REVIEW_TOKEN_STALLED_UNITS)
      : addPeriod(cycle.dueDate90, SELF_REVIEW_TOKEN_VALID_UNITS);
    await ReviewCycleModel.updateOne(
      { _id: cycle._id },
      { $set: { selfReviewToken: token, selfReviewTokenExpiresAt: expiresAt } },
    );
    return token;
  }

  /**
   * Validate self-review token and return cycle + employee for the public self-review flow.
   * Returns null if token invalid or expired or already submitted.
   */
  async validateSelfReviewToken(token: string): Promise<{
    cycle: { _id: unknown; employeeId: unknown; status: string };
    employee: { firstName: string; lastName: string };
  } | null> {
    if (!token?.trim()) return null;
    const cycle = await ReviewCycleModel.findOne({
      selfReviewToken: token.trim(),
      selfReviewTokenExpiresAt: { $gt: new Date() },
    })
      .populate("employeeId", "firstName lastName")
      .lean();
    if (!cycle || cycle.selfReviewId) return null;
    const validStatuses: ReviewCycleStatus[] = [
      "form_available_85", "self_review_due", "self_review_late", "self_review_past_due",
    ];
    if (!validStatuses.includes(cycle.status)) return null;
    const emp = cycle.employeeId as { firstName?: string; lastName?: string } | null;
    if (!emp) return null;
    return {
      cycle: { _id: cycle._id, employeeId: cycle.employeeId, status: cycle.status },
      employee: { firstName: emp.firstName ?? "", lastName: emp.lastName ?? "" },
    };
  }

  /**
   * Get questionnaire and metadata for the public self-review page (by token). No auth.
   */
  async getSelfReviewByToken(token: string): Promise<{
    cycleId: string;
    questionnaire: Array<{ id: string; text: string; type: string; required: boolean; order: number; options?: string[] }>;
    employeeName: string;
    alreadySubmitted: boolean;
  } | null> {
    const validated = await this.validateSelfReviewToken(token);
    if (!validated) return null;
    const cycleId = (validated.cycle._id as { toString(): string }).toString();
    const settings = await ReviewSettingsModel.findOne().select("selfReviewQuestionnaire").lean();
    const questionnaire = settings?.selfReviewQuestionnaire ?? [];
    const existing = await SelfReviewModel.findOne({ reviewCycleId: validated.cycle._id }).lean();
    return {
      cycleId,
      questionnaire: questionnaire.map((q: { id: string; text: string; type: string; required: boolean; order: number; options?: string[] }) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        required: q.required,
        order: q.order,
        options: q.options,
      })),
      employeeName: [validated.employee.firstName, validated.employee.lastName].filter(Boolean).join(" ") || "Employee",
      alreadySubmitted: !!existing,
    };
  }

  /**
   * Submit self-review using token. Clears token on success. No auth.
   */
  async submitSelfReviewByToken(token: string, responses: QuestionResponse[]): Promise<{ success: true }> {
    const validated = await this.validateSelfReviewToken(token);
    if (!validated) throw new AppError("Invalid or expired link. Please use the latest link from your email.", 400);
    const cycleId = (validated.cycle._id as { toString(): string }).toString();
    const empRef = validated.cycle.employeeId as { _id?: { toString(): string } } | undefined;
    const employeeId = empRef && typeof empRef === "object" && "_id" in empRef
      ? (empRef._id as { toString(): string }).toString()
      : String(validated.cycle.employeeId);
    if (!employeeId) throw new AppError("Invalid cycle", 400);
    await this.submitSelfReview(cycleId, employeeId, responses);
    await ReviewCycleModel.updateOne(
      { _id: validated.cycle._id },
      { $unset: { selfReviewToken: 1, selfReviewTokenExpiresAt: 1 } },
    );
    return { success: true };
  }

  async createCycleForEmployee(employeeId: string, referenceDate: Date, cycleNumber?: number): Promise<void> {
    const employee = await UserModel.findById(employeeId).lean();
    if (!employee || employee.isTerminated === true) return;

    const existing = await ReviewCycleModel.findOne({ employeeId, dueDate90: referenceDate });
    if (existing) return;

    const num = cycleNumber ?? (await ReviewCycleModel.countDocuments({ employeeId })) + 1;
    const dates = this.computeDates(referenceDate);
    const now = new Date();

    let status: ReviewCycleStatus = "upcoming";
    if (now >= dates.dueDate90) status = "self_review_due";
    else if (now >= dates.formAvailableDate85) status = "form_available_85";
    else if (now >= dates.notifyDate75) status = "notification_sent_75";

    const scheduledNextCycleReferenceDate = addPeriod(referenceDate, NEXT_CYCLE_OFFSET);

    const cycle = await ReviewCycleModel.create({
      employeeId,
      cycleNumber: num,
      referenceDate,
      status,
      scheduledNextCycleReferenceDate,
      ...dates,
    });
    const cycleId = (cycle._id as { toString(): string }).toString();
    const selfReviewUrl = await this.ensureSelfReviewToken(cycle).then(
      (t) => (t ? `${CLIENT_URL}/self-review?token=${encodeURIComponent(t)}` : null),
    );
    const dashboardUrl = `${CLIENT_URL}/dashboard/reviews-management`;
    const actionUrl = selfReviewUrl ?? dashboardUrl;

    const firstName = String(employee?.firstName ?? "");
    if (status === "notification_sent_75") {
      await notificationService.send({
        recipientId: employeeId,
        type: "review_self_upcoming",
        title: "Self-Review Period Approaching",
        message: "Your self-review window is approaching. You will receive another email when the form is available.",
        data: { reviewCycleId: cycleId },
        channels: ["all"],
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { firstName },
      });
    } else if (status === "form_available_85") {
      await notificationService.send({
        recipientId: employeeId,
        type: "review_self_available",
        title: "Self-Review Form Available",
        message: "Your self-review form is now available. Please complete it before the due date.",
        data: { reviewCycleId: cycleId },
        channels: ["all"],
        actionUrl,
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { firstName, actionUrl },
        emailButtonText: "Complete self-review",
      });
    } else if (status === "self_review_due") {
      await notificationService.send({
        recipientId: employeeId,
        type: "review_self_due",
        title: "Self-Review Due Today",
        message: "Your self-review is due today. Please submit it as soon as possible.",
        data: { reviewCycleId: cycleId },
        channels: ["all"],
        actionUrl,
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { firstName, actionUrl },
        emailButtonText: "Complete self-review",
      });
    }
  }

  async initializeCyclesForExistingEmployees(): Promise<number> {
    const settings = await ReviewSettingsModel.findOne().lean();
    if (!settings?.employeeRoleIds?.length) {
      logger.info("ReviewCycle init: no employee roles configured");
      return 0;
    }

    const roleIds = settings.employeeRoleIds.map(String);
    const roles = await RoleModel.find({ _id: { $in: roleIds } }).select("name").lean();
    const roleNames = roles.map((r) => r.name);

    const employees = await UserModel.find({
      role: { $in: roleNames },
      isActive: true,
      isTerminated: { $ne: true },
    }).lean();

    let count = 0;
    for (const emp of employees) {
      const startDate = emp.startDate ?? emp.homebaseData?.created_at ?? emp.createdAt;
      if (!startDate) continue;

      const existingCycle = await ReviewCycleModel.findOne({
        employeeId: emp._id,
        status: { $nin: REVIEW_CYCLE_TERMINAL_FOR_NEW_CYCLE },
      });
      if (existingCycle) continue;

      const nextRef = this.computeNextReferenceDate(new Date(startDate));
      await this.createCycleForEmployee(emp._id.toString(), nextRef);
      count++;
    }
    logger.info(`ReviewCycle init: created ${count} cycles for existing employees`);
    return count;
  }

  /**
   * Start a review cycle for a single user. Used after create, Homebase sync, or from user-management "Start review cycle".
   */
  async startCycleForUser(userId: string): Promise<{ started: boolean; message?: string }> {
    const user = await UserModel.findById(userId).select("role roleId isTerminated startDate homebaseData createdAt").lean();
    if (!user) return { started: false, message: "User not found" };
    if (user.isTerminated === true) return { started: false, message: "User is terminated" };

    const existingCycle = await ReviewCycleModel.findOne({
      employeeId: userId,
      status: { $nin: REVIEW_CYCLE_TERMINAL_FOR_NEW_CYCLE },
    });
    if (existingCycle) return { started: false, message: "User already has an active review cycle" };

    const startDateRaw = user.startDate ?? user.homebaseData?.created_at ?? user.createdAt;
    if (!startDateRaw) return { started: false, message: "No start date" };
    const startDate = new Date(startDateRaw);

    const settings = await ReviewSettingsModel.findOne().lean();
    if (!settings?.employeeRoleIds?.length)
      return { started: false, message: "Review employee roles not configured" };
    const roleIds = settings.employeeRoleIds.map(String);
    const roles = await RoleModel.find({ _id: { $in: roleIds } }).select("name").lean();
    const roleNames = new Set(roles.map((r) => r.name));
    if (!user.role || !roleNames.has(user.role))
      return { started: false, message: "User role is not an employee role" };

    const nextRef = this.computeNextReferenceDate(startDate);
    await this.createCycleForEmployee(userId, nextRef);
    return { started: true };
  }

  /**
   * Resolves effective location IDs for a user (role locations ∪ overrides) \ removals.
   * Returns "all" if the user has access to all locations.
   */
  private async resolveUserLocationIds(userId: string): Promise<"all" | string[]> {
    const user = await UserModel.findById(userId).select("roleId locationOverrides locationRemovals").lean();
    if (!user?.roleId) return "all";

    const role = await RoleModel.findById(user.roleId).select("locationAccess locationIds").lean();
    if (!role || role.locationAccess !== "specific" || !role.locationIds?.length) {
      return "all";
    }

    const baseIds = new Set(role.locationIds.map(String));
    for (const ov of (user.locationOverrides ?? []).map(String)) baseIds.add(ov);
    for (const rm of (user.locationRemovals ?? []).map(String)) baseIds.delete(rm);
    return [...baseIds];
  }

  /**
   * Check whether a specific user has access to at least one location in a given set.
   * If the user has "all" locations, returns true unless they have explicit removals that exclude all.
   */
  private async userHasLocationOverlap(userId: string, targetLocationIds: "all" | string[]): Promise<boolean> {
    if (targetLocationIds === "all") return true;
    const userLocs = await this.resolveUserLocationIds(userId);
    if (userLocs === "all") return true;
    const userLocSet = new Set(userLocs);
    return targetLocationIds.some((loc) => userLocSet.has(loc));
  }

  private resolveEmployeeLocations(
    emp: { locationOverrides?: unknown[]; locationRemovals?: unknown[] },
    empRole: { locationAccess?: string; locationIds?: unknown[] },
  ): "all" | string[] {
    if (empRole.locationAccess !== "specific" || !empRole.locationIds?.length) return "all";
    const baseIds = new Set(empRole.locationIds.map(String));
    for (const ov of (emp.locationOverrides ?? []).map(String)) baseIds.add(ov);
    for (const rm of (emp.locationRemovals ?? []).map(String)) baseIds.delete(rm);
    return [...baseIds];
  }

  /**
   * Keep only users whose effective locations (role + overrides − removals) include the navbar location.
   * Users with role "all locations" are included for any location.
   */
  private async filterEmployeeIdsByNavbarLocation(employeeIds: string[], locationId: string): Promise<string[]> {
    const loc = String(locationId).trim();
    if (!loc || employeeIds.length === 0) return [];

    const users = await UserModel.find({ _id: { $in: employeeIds } })
      .select("_id roleId locationOverrides locationRemovals")
      .lean();
    if (users.length === 0) return [];

    const allRoles = await RoleModel.find().select("_id locationAccess locationIds").lean();
    const roleCache = new Map(allRoles.map((r) => [r._id.toString(), r]));

    const out: string[] = [];
    for (const emp of users) {
      const empRole = roleCache.get(emp.roleId?.toString() ?? "");
      if (!empRole) continue;
      const empLocs = this.resolveEmployeeLocations(emp, empRole as { locationAccess?: string; locationIds?: unknown[] });
      if (empLocs === "all" || empLocs.includes(loc)) {
        out.push(emp._id.toString());
      }
    }
    return out;
  }

  /**
   * Returns employee IDs visible to the given actor, filtered by:
   * 1. Role hierarchy: employees whose roleId is a descendant of the actor's roleId
   * 2. Location access: employees that share at least one location with the actor
   * If actorUserId is null, returns all employee IDs (admin/unscoped).
   */
  async getVisibleEmployeeIds(actorUserId: string | null): Promise<string[] | null> {
    if (!actorUserId) return null;

    const actor = await UserModel.findById(actorUserId).select("roleId locationOverrides locationRemovals").lean();
    if (!actor?.roleId) return null;

    const actorRoleIdStr = actor.roleId.toString();
    const allRoles = await RoleModel.find().select("_id name reportsTo").lean();
    const hierarchyRoles: HierarchyRole[] = allRoles.map((r) => ({
      _id: r._id.toString(),
      name: r.name,
      reportsTo: r.reportsTo?.toString() ?? null,
    }));

    const descendantRoleIds = getDescendantRoleIds(actorRoleIdStr, hierarchyRoles);
    if (descendantRoleIds.length === 0) return [];

    const actorLocations = await this.resolveUserLocationIds(actorUserId);

    const employees = await UserModel.find({
      roleId: { $in: descendantRoleIds },
      isActive: true,
      isTerminated: { $ne: true },
    }).select("_id roleId locationOverrides locationRemovals").lean();

    if (actorLocations === "all") {
      return employees.map((e) => e._id.toString());
    }

    const actorLocSet = new Set(actorLocations);
    const roleCache = new Map(allRoles.map((r) => [r._id.toString(), r]));

    return employees.filter((emp) => {
      const empRole = roleCache.get(emp.roleId?.toString() ?? "");
      if (!empRole) return false;

      const empLocs = this.resolveEmployeeLocations(emp, empRole as { locationAccess?: string; locationIds?: unknown[] });
      if (empLocs === "all") return true;
      return empLocs.some((loc) => actorLocSet.has(loc));
    }).map((e) => e._id.toString());
  }

  async getManagerForEmployee(employeeId: string): Promise<string | null> {
    const settings = await ReviewSettingsModel.findOne().lean();
    if (!settings?.managerRoleIds?.length) return null;

    const employee = await UserModel.findById(employeeId).select("roleId").lean();
    if (!employee?.roleId) return null;

    const allRoles = await RoleModel.find().select("_id name reportsTo locationAccess locationIds").lean();
    const hierarchyRoles: HierarchyRole[] = allRoles.map((r) => ({
      _id: r._id.toString(),
      name: r.name,
      reportsTo: r.reportsTo?.toString() ?? null,
    }));

    const employeeRoleIdStr = employee.roleId.toString();
    const ancestors = this.getAncestorChain(employeeRoleIdStr, hierarchyRoles);
    const managerRoleIdSet = new Set(settings.managerRoleIds.map(String));

    for (const ancestorRoleId of ancestors) {
      if (!managerRoleIdSet.has(ancestorRoleId)) continue;

      const ancestorRole = allRoles.find((r) => r._id.toString() === ancestorRoleId);
      if (!ancestorRole) continue;

      const candidates = await UserModel.find({
        roleId: ancestorRoleId,
        isActive: true,
        isTerminated: { $ne: true },
      }).select("_id locationOverrides locationRemovals").lean();

      for (const candidate of candidates) {
        const hasOverlap = await this.userHasLocationOverlap(candidate._id.toString(), await this.resolveUserLocationIds(employeeId));
        if (hasOverlap) return candidate._id.toString();
      }
    }

    return null;
  }

  async getDirectorForEmployee(employeeId: string): Promise<string | null> {
    const settings = await ReviewSettingsModel.findOne().lean();
    if (!settings?.directorRoleIds?.length) return null;

    const allRoles = await RoleModel.find().select("_id name reportsTo locationAccess locationIds").lean();
    const hierarchyRoles: HierarchyRole[] = allRoles.map((r) => ({
      _id: r._id.toString(),
      name: r.name,
      reportsTo: r.reportsTo?.toString() ?? null,
    }));

    const employee = await UserModel.findById(employeeId).select("roleId").lean();
    if (!employee?.roleId) return null;

    const ancestors = this.getAncestorChain(employee.roleId.toString(), hierarchyRoles);
    const directorRoleIdSet = new Set(settings.directorRoleIds.map(String));

    for (const ancestorRoleId of ancestors) {
      if (!directorRoleIdSet.has(ancestorRoleId)) continue;

      const candidates = await UserModel.find({
        roleId: ancestorRoleId,
        isActive: true,
        isTerminated: { $ne: true },
      }).select("_id locationOverrides locationRemovals").lean();

      for (const candidate of candidates) {
        const hasOverlap = await this.userHasLocationOverlap(candidate._id.toString(), await this.resolveUserLocationIds(employeeId));
        if (hasOverlap) return candidate._id.toString();
      }
    }

    return null;
  }

  private getAncestorChain(roleId: string, roles: HierarchyRole[]): string[] {
    const byId = new Map(roles.map((r) => [r._id, r]));
    const result: string[] = [];
    let current = byId.get(roleId)?.reportsTo ?? null;
    const visited = new Set<string>();
    while (current != null && !visited.has(current)) {
      result.push(current);
      visited.add(current);
      current = byId.get(current)?.reportsTo ?? null;
    }
    return result;
  }

  async submitSelfReview(cycleId: string, employeeId: string, responses: QuestionResponse[]) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);
    if (cycle.employeeId.toString() !== employeeId) throw new AppError("Not your review cycle", 403);

    const validStatuses: ReviewCycleStatus[] = [
      "form_available_85", "self_review_due", "self_review_late", "self_review_past_due",
    ];
    if (!validStatuses.includes(cycle.status)) {
      throw new AppError(`Cannot submit self-review in status: ${cycle.status}`, 400);
    }

    const selfReview = await SelfReviewModel.create({
      reviewCycleId: cycle._id,
      employeeId,
      responses,
      submittedAt: new Date(),
    });

    cycle.selfReviewId = selfReview._id;
    cycle.status = "self_review_submitted";
    await cycle.save();

    const managerId = await this.getManagerForEmployee(employeeId);
    if (managerId) {
      cycle.reviewedByManagerId = managerId as unknown as typeof cycle.reviewedByManagerId;
      cycle.status = "manager_review_due";
      await cycle.save();

      const managerUser = await UserModel.findById(managerId).select("firstName").lean();
      const managerFirstName = (managerUser as { firstName?: string } | null)?.firstName ?? "";
      await notificationService.send({
        recipientId: managerId,
        type: "review_manager_pending",
        title: "Employee Self-Review Submitted",
        message: "An employee has submitted their self-review. Your review is now due.",
        data: { reviewCycleId: cycleId, employeeId },
        channels: ["all"],
        actionUrl: `${CLIENT_URL}/dashboard/reviews-management`,
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { actionUrl: `${CLIENT_URL}/dashboard/reviews-management`, firstName: managerFirstName },
        emailButtonText: "View",
      });
    }

    return selfReview;
  }

  /**
   * Manager completes their review (saves and locks). Does not send to director.
   * Unlocks "View Employee Self-Review". Cycle status unchanged.
   */
  async completeManagerReview(cycleId: string, managerId: string, responses: QuestionResponse[]) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const validStatuses: ReviewCycleStatus[] = ["manager_review_due", "manager_review_pending", "manager_review_past_due"];
    if (!validStatuses.includes(cycle.status)) {
      throw new AppError(`Cannot complete manager review in status: ${cycle.status}`, 400);
    }

    const existing = await ManagerReviewModel.findOne({ reviewCycleId: cycleId });
    if (existing) throw new AppError("Manager review already completed for this cycle", 400);

    const now = new Date();
    const managerReview = await ManagerReviewModel.create({
      reviewCycleId: cycle._id,
      managerId,
      employeeId: cycle.employeeId,
      responses,
      revisionHistory: [{ responses: [...responses], updatedAt: now }],
      submittedAt: now,
    });

    cycle.managerReviewId = managerReview._id;
    cycle.reviewedByManagerId = managerId as unknown as typeof cycle.reviewedByManagerId;
    await cycle.save();

    return managerReview;
  }

  /**
   * After manager_review_submitted, assign director and notify (idempotent).
   * Reloads the cycle from DB so retries work if a previous submit partially failed.
   */
  private async advanceReviewCycleToDirectorAfterManagerSubmit(cycleId: string): Promise<void> {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) return;
    if (
      cycle.status === "director_approval_due" ||
      cycle.status === "director_approval_pending" ||
      cycle.status === "director_approval_past_due"
    ) return;
    if (cycle.status !== "manager_review_submitted") return;

    const directorId = await this.getDirectorForEmployee(cycle.employeeId.toString());
    if (!directorId) return;

    cycle.approvedByDirectorId = directorId as unknown as typeof cycle.approvedByDirectorId;
    cycle.status = "director_approval_due";
    await cycle.save();

    const directorUser = await UserModel.findById(directorId).select("firstName").lean();
    const directorFirstName = (directorUser as { firstName?: string } | null)?.firstName ?? "";
    await notificationService.send({
      recipientId: directorId,
      type: "review_director_pending",
      title: "Review Awaiting Your Approval",
      message: "A manager review has been submitted and awaits your approval.",
      data: { reviewCycleId: cycleId, employeeId: cycle.employeeId.toString() },
      channels: ["all"],
      actionUrl: `${CLIENT_URL}/dashboard/reviews-management`,
      emailTemplateFile: "review-email.ejs",
      emailTemplateData: { actionUrl: `${CLIENT_URL}/dashboard/reviews-management`, firstName: directorFirstName },
      emailButtonText: "View",
    });
  }

  /**
   * Submit manager review to director. Requires review to have been completed first.
   * Uses the submitted responses as-is (managers may edit after initial complete / viewing self-review).
   * Appends a snapshot to revision history so director UI can compare initial vs submitted version.
   */
  async submitManagerReview(cycleId: string, managerId: string, responses: QuestionResponse[]) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const review = await ManagerReviewModel.findOne({ reviewCycleId: cycleId });
    if (!review) throw new AppError("Complete your review first, then submit to director", 400);
    if (String(review.managerId) !== String(managerId)) throw new AppError("Not your review", 403);

    if (
      cycle.status === "director_approval_due" ||
      cycle.status === "director_approval_pending" ||
      cycle.status === "director_approval_past_due"
    ) {
      return review;
    }

    // Retry: review + cycle already persisted manager_review_submitted but director step failed (or client retried).
    if (cycle.status === "manager_review_submitted") {
      await this.advanceReviewCycleToDirectorAfterManagerSubmit(cycleId);
      return review;
    }

    const validStatuses: ReviewCycleStatus[] = ["manager_review_due", "manager_review_pending", "manager_review_past_due"];
    if (!validStatuses.includes(cycle.status)) {
      throw new AppError(`Cannot submit manager review in status: ${cycle.status}`, 400);
    }

    // Plain objects + separate array instances — reusing the same array for `responses` and a
    // `revisionHistory` entry can break Mongoose validation / save (user saw submit fail silently).
    const normalize = (r: QuestionResponse) => ({
      questionId: String(r.questionId),
      questionText: String(r.questionText ?? ""),
      answer: r.answer == null ? "" : String(r.answer),
    });
    const submittedSnapshot = responses.map(normalize);
    const historySnapshot = submittedSnapshot.map((r) => ({ ...r }));
    review.responses = submittedSnapshot.map((r) => ({ ...r }));
    review.revisionHistory.push({ responses: historySnapshot, updatedAt: new Date() });
    review.lastUpdatedAt = new Date();
    await review.save();

    cycle.status = "manager_review_submitted";
    await cycle.save();

    await this.advanceReviewCycleToDirectorAfterManagerSubmit(cycleId);

    return review;
  }

  /**
   * Update manager review before submitting to director (saves edits; prior snapshot kept in revision history).
   */
  async updateManagerReview(cycleId: string, managerId: string, responses: QuestionResponse[]) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const validStatuses: ReviewCycleStatus[] = ["manager_review_due", "manager_review_pending", "manager_review_past_due"];
    if (!validStatuses.includes(cycle.status)) {
      throw new AppError(`Cannot update manager review in status: ${cycle.status}`, 400);
    }

    const review = await ManagerReviewModel.findOne({ reviewCycleId: cycleId });
    if (!review) throw new AppError("Manager review not found", 404);
    if (review.managerId.toString() !== managerId) throw new AppError("Not your review", 403);

    const prior = review.responses.map((r) => ({
      questionId: r.questionId,
      questionText: r.questionText,
      answer: r.answer,
    }));
    const next = responses.map((r) => ({
      questionId: r.questionId,
      questionText: r.questionText,
      answer: r.answer,
    }));
    review.responses = next;
    review.revisionHistory.push({ responses: prior, updatedAt: new Date() });
    review.lastUpdatedAt = new Date();
    await review.save();

    return review;
  }

  async approveReview(
    cycleId: string,
    directorId: string,
    comments?: string,
    salaryIncrement?: number,
  ) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const validStatuses: ReviewCycleStatus[] = ["director_approval_due", "director_approval_pending", "director_approval_past_due"];
    if (!validStatuses.includes(cycle.status)) {
      throw new AppError(`Cannot approve in status: ${cycle.status}`, 400);
    }

    cycle.directorDecision = "approved";
    cycle.directorComments = comments;
    cycle.salaryIncrement = salaryIncrement;
    cycle.approvedByDirectorId = directorId as unknown as typeof cycle.approvedByDirectorId;
    cycle.status = "approved";
    await cycle.save();

    if (cycle.reviewedByManagerId) {
      cycle.status = "sharing_due";
      await cycle.save();

      const mgrId = cycle.reviewedByManagerId.toString();
      const mgrUser = await UserModel.findById(mgrId).select("firstName").lean();
      const mgrFirstName = (mgrUser as { firstName?: string } | null)?.firstName ?? "";
      const dashboardUrl = `${CLIENT_URL}/dashboard/reviews-management`;
      await notificationService.send({
        recipientId: mgrId,
        type: "review_approved",
        title: "Review Approved by Director",
        message: "The director has approved the review. Please share with the employee and create an action plan.",
        data: { reviewCycleId: cycleId },
        channels: ["all"],
        actionUrl: dashboardUrl,
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { actionUrl: dashboardUrl, firstName: mgrFirstName },
        emailButtonText: "View",
      });
    }

    return cycle;
  }

  async rejectReview(cycleId: string, directorId: string, comments: string) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const validStatuses: ReviewCycleStatus[] = ["director_approval_due", "director_approval_pending", "director_approval_past_due"];
    if (!validStatuses.includes(cycle.status)) {
      throw new AppError(`Cannot reject in status: ${cycle.status}`, 400);
    }

    cycle.directorDecision = "rejected";
    cycle.directorComments = comments;
    cycle.approvedByDirectorId = directorId as unknown as typeof cycle.approvedByDirectorId;
    cycle.status = "rejected";
    await cycle.save();

    if (cycle.reviewedByManagerId) {
      const mgrId = cycle.reviewedByManagerId.toString();
      const mgrUser = await UserModel.findById(mgrId).select("firstName").lean();
      const mgrFirstName = (mgrUser as { firstName?: string } | null)?.firstName ?? "";
      const dashboardUrl = `${CLIENT_URL}/dashboard/reviews-management`;
      await notificationService.send({
        recipientId: mgrId,
        type: "review_rejected",
        title: "Review Rejected by Director",
        message: `The director has rejected the review. Comments: ${comments}`,
        data: { reviewCycleId: cycleId },
        channels: ["all"],
        actionUrl: dashboardUrl,
        emailTemplateFile: "review-email.ejs",
        emailTemplateData: { actionUrl: dashboardUrl, firstName: mgrFirstName },
        emailButtonText: "View",
      });
    }

    return cycle;
  }

  async createActionPlan(
    cycleId: string,
    managerId: string,
    items: { period: "30" | "60" | "90"; description: string; targetScore?: string; currentScore?: string }[],
  ) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const plan = await ActionPlanModel.create({
      reviewCycleId: cycle._id,
      employeeId: cycle.employeeId,
      createdByManagerId: managerId,
      items,
    });

    cycle.actionPlanId = plan._id;
    await cycle.save();
    return plan;
  }

  async completeReview(cycleId: string, managerId: string) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const validStatuses: ReviewCycleStatus[] = ["sharing_due", "sharing_pending", "sharing_past_due", "approved"];
    if (!validStatuses.includes(cycle.status)) {
      throw new AppError(`Cannot complete in status: ${cycle.status}`, 400);
    }

    cycle.status = "completed";
    cycle.completedAt = new Date();
    await cycle.save();

    await notificationService.send({
      recipientId: cycle.employeeId.toString(),
      type: "review_completed",
      title: "Review Cycle Completed",
      message: "Your review cycle has been completed.",
      data: { reviewCycleId: cycleId },
      channels: ["in_app"],
    });

    return cycle;
  }

  async submitCheckIn(
    cycleId: string,
    period: "30" | "60",
    managerId: string,
    data: {
      responses: QuestionResponse[];
      managerComments?: string;
      actionPlanProgress?: string;
      actionItemProgress?: { actionPlanItemIndex: number; value?: string }[];
    },
  ) {
    const cycle = await ReviewCycleModel.findById(cycleId);
    if (!cycle) throw new AppError("Review cycle not found", 404);

    const checkIn = await CheckInModel.create({
      reviewCycleId: cycle._id,
      period,
      managerId,
      employeeId: cycle.employeeId,
      responses: data.responses,
      managerComments: data.managerComments,
      actionPlanProgress: data.actionPlanProgress,
      actionItemProgress: data.actionItemProgress ?? [],
      submittedAt: new Date(),
    });

    if (period === "30") {
      cycle.checkIn30Id = checkIn._id;
      cycle.status = "checkin_30_complete";
    } else {
      cycle.checkIn60Id = checkIn._id;
      cycle.status = "checkin_60_complete";
    }
    await cycle.save();

    if (period === "60") {
      const nextRef = addPeriod(cycle.completedAt ?? new Date(), NEXT_CYCLE_OFFSET);
      await this.createCycleForEmployee(
        cycle.employeeId.toString(),
        nextRef,
        cycle.cycleNumber + 1,
      );
      cycle.status = "cycle_complete";
      await cycle.save();
    }

    return checkIn;
  }

  async getDashboardKPIs(actorUserId: string | null) {
    const filter: Record<string, unknown> = {};

    const visibleIds = await this.getVisibleEmployeeIds(actorUserId);
    if (visibleIds !== null) {
      filter.employeeId = { $in: visibleIds };
    }

    const [total, dueCount, pastDueCount, inProgress, completedThisQuarter] = await Promise.all([
      ReviewCycleModel.countDocuments(filter),
      ReviewCycleModel.countDocuments({ ...filter, status: { $in: ["self_review_due", "manager_review_due", "manager_review_pending", "director_approval_due", "director_approval_pending", "sharing_due", "checkin_30_due", "checkin_60_due"] } }),
      ReviewCycleModel.countDocuments({ ...filter, status: { $regex: /past_due/ } }),
      ReviewCycleModel.countDocuments({
        ...filter,
        status: { $nin: ["cycle_complete", "cycle_superseded", "completed", "checkin_60_complete", "checkin_60_done"] },
      }),
      ReviewCycleModel.countDocuments({
        ...filter,
        completedAt: { $gte: new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1) },
      }),
    ]);

    return { total, dueCount, pastDueCount, inProgress, completedThisQuarter };
  }

  async getCycles(query: {
    actorUserId?: string;
    userId?: string;
    status?: string;
    pastOnly?: boolean;
    page?: number;
    limit?: number;
    /** When set (navbar location), only cycles for employees assigned this location on role + overrides. */
    locationId?: string;
  }) {
    const { page = 1, limit = 20 } = query;
    const filter: Record<string, unknown> = {};

    if (query.pastOnly) filter.status = { $in: REVIEW_CYCLE_PAST_STATUSES };
    else if (query.status) filter.status = query.status;

    const locationId = query.locationId?.trim();

    let employeeIdFilter: string[] | null = null;

    if (query.userId) {
      employeeIdFilter = [query.userId];
    } else {
      employeeIdFilter = await this.getVisibleEmployeeIds(query.actorUserId ?? null);
    }

    if (locationId) {
      if (employeeIdFilter !== null) {
        if (employeeIdFilter.length === 0) {
          return { cycles: [], total: 0 };
        }
        employeeIdFilter = await this.filterEmployeeIdsByNavbarLocation(employeeIdFilter, locationId);
      } else {
        const distinctRaw = await ReviewCycleModel.distinct("employeeId", { ...filter });
        const distinctIds = distinctRaw.map((id) => String(id));
        employeeIdFilter = await this.filterEmployeeIdsByNavbarLocation(distinctIds, locationId);
      }
      if (employeeIdFilter.length === 0) {
        return { cycles: [], total: 0 };
      }
    }

    if (employeeIdFilter !== null) {
      filter.employeeId = { $in: employeeIdFilter };
    }

    const [cycles, total] = await Promise.all([
      ReviewCycleModel.find(filter)
        .populate("employeeId", "firstName lastName email role profileImagePublicId startDate")
        .sort({ updatedAt: -1, dueDate90: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ReviewCycleModel.countDocuments(filter),
    ]);

    return { cycles, total };
  }

  /**
   * Full read-only snapshot for Past Review detail (auth checked).
   */
  async getCycleSnapshot(cycleId: string, actorUserId: string | undefined): Promise<{
    cycle: Record<string, unknown>;
    selfReview: Record<string, unknown> | null;
    managerReview: Record<string, unknown> | null;
    actionPlan: Record<string, unknown> | null;
    checkIns: Record<string, unknown>[];
  }> {
    const cycle = await ReviewCycleModel.findById(cycleId)
      .populate("employeeId", "firstName lastName email role profileImagePublicId startDate")
      .populate("reviewedByManagerId", "firstName lastName email role")
      .populate("approvedByDirectorId", "firstName lastName email role")
      .lean();
    if (!cycle) throw new AppError("Cycle not found", 404);

    const rawEmp = cycle.employeeId as { _id?: { toString(): string } } | string | null;
    const employeeIdStr =
      typeof rawEmp === "object" && rawEmp !== null && "_id" in rawEmp && rawEmp._id
        ? rawEmp._id.toString()
        : String(rawEmp ?? "");

    const visibleIds = await this.getVisibleEmployeeIds(actorUserId ?? null);
    if (visibleIds !== null && !visibleIds.includes(employeeIdStr)) {
      throw new AppError("Access denied", 403);
    }

    const [selfReview, managerReview, actionPlan, checkIns] = await Promise.all([
      SelfReviewModel.findOne({ reviewCycleId: cycle._id }).lean(),
      ManagerReviewModel.findOne({ reviewCycleId: cycle._id }).lean(),
      ActionPlanModel.findOne({ reviewCycleId: cycle._id }).lean(),
      CheckInModel.find({ reviewCycleId: cycle._id }).sort({ period: 1 }).lean(),
    ]);

    return {
      cycle: cycle as unknown as Record<string, unknown>,
      selfReview: selfReview as Record<string, unknown> | null,
      managerReview: managerReview as Record<string, unknown> | null,
      actionPlan: actionPlan as Record<string, unknown> | null,
      checkIns: checkIns as Record<string, unknown>[],
    };
  }

  /**
   * When scheduled next reference date passes and the cycle is still open, supersede it and start the next cycle.
   */
  async supersedeStaleScheduledCycles(): Promise<number> {
    const now = new Date();
    const candidates = await ReviewCycleModel.find({
      scheduledNextCycleReferenceDate: { $lte: now },
      status: { $nin: REVIEW_CYCLE_TERMINAL_FOR_NEW_CYCLE },
    }).lean();

    let count = 0;
    for (const c of candidates) {
      const empId = c.employeeId.toString();
      const user = await UserModel.findById(empId).select("isTerminated").lean();
      if (user?.isTerminated === true) continue;

      const nextNum = c.cycleNumber + 1;
      const nextExists = await ReviewCycleModel.findOne({
        employeeId: c.employeeId,
        cycleNumber: nextNum,
      })
        .select("_id")
        .lean();
      if (nextExists) continue;

      const ref = c.scheduledNextCycleReferenceDate;
      if (!ref) continue;

      const dupDue = await ReviewCycleModel.findOne({
        employeeId: c.employeeId,
        dueDate90: ref,
        _id: { $ne: c._id },
      })
        .select("_id")
        .lean();
      if (dupDue) continue;

      const prevStatus = c.status;
      await ReviewCycleModel.updateOne({ _id: c._id }, { $set: { status: "cycle_superseded" as ReviewCycleStatus } });
      try {
        await this.createCycleForEmployee(empId, new Date(ref), nextNum);
        count += 1;
      } catch (err) {
        logger.error("supersedeStaleScheduledCycles: failed to create next cycle", { cycleId: c._id, err });
        await ReviewCycleModel.updateOne({ _id: c._id }, { $set: { status: prevStatus } });
      }
    }
    return count;
  }
}

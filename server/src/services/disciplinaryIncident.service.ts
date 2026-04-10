import { Types } from "mongoose";
import { DisciplinaryIncidentRepository } from "../repositories/disciplinaryIncident.repository.js";
import { DisciplinarySettingsModel } from "../models/disciplinarySettings.model.js";
import { UserModel } from "../models/user.model.js";
import { RoleModel } from "../models/role.model.js";
import { DisciplinaryIncidentModel } from "../models/disciplinaryIncident.model.js";
import { LocationModel } from "../models/location.model.js";
import { NotificationService } from "./notification.service.js";
import { AppError } from "../utils/errors.util.js";
import {
  getDescendantRoleIds,
  getAncestorRoleIds,
  isAncestorOf,
} from "../utils/roleHierarchy.util.js";
import type { HierarchyRole } from "../utils/roleHierarchy.util.js";
import type {
  IDisciplinaryIncident,
  DisciplinaryEmployeeListItem,
  DisciplinaryStatus,
  IDisciplineGuideline,
} from "../types/disciplinary.types.js";
import { logger } from "../utils/logger.util.js";
import { PdfGeneratorService } from "./pdfGenerator.service.js";
import { getAdobeSignService } from "./adobeSign.service.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { getDisciplinaryFolder } from "../config/upload.config.js";

const repo = new DisciplinaryIncidentRepository();
const notificationService = new NotificationService();

export class DisciplinaryIncidentService {
  private getStatusThresholds(
    guidelines: IDisciplineGuideline[],
    pointsToTermination: number,
  ): {
    firstThreshold: number | null;
    atRiskThreshold: number | null;
    criticalThreshold: number;
  } {
    const sortedUnique = [...new Set(guidelines.map((g) => g.pointThreshold))]
      .filter((value) => value < pointsToTermination)
      .sort((a, b) => a - b);

    const firstThreshold = sortedUnique[0] ?? null;
    const atRiskThreshold = sortedUnique.at(-1) ?? null;

    return {
      firstThreshold,
      atRiskThreshold,
      criticalThreshold: pointsToTermination,
    };
  }

  private toSafeFileToken(value: string): string {
    return value
      .trim()
      .replaceAll(/[^a-zA-Z0-9]+/g, "_")
      .replaceAll(/(^_+)|(_+$)/g, "") || "Unknown";
  }

  private toDateToken(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  private toIdString(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") return value;
    if (value instanceof Types.ObjectId) return value.toString();
    if (
      typeof value === "object" &&
      "toHexString" in (value as Record<string, unknown>) &&
      typeof (value as { toHexString?: unknown }).toHexString === "function"
    ) {
      return (value as { toHexString: () => string }).toHexString();
    }
    if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
      const nestedId = (value as { _id?: unknown })._id;
      return this.toIdString(nestedId);
    }
    return null;
  }

  private locationIdEntryToString(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
      return this.toIdString((value as { _id: unknown })._id) ?? "";
    }
    if (typeof value === "object") {
      return typeof (value as { toString?: () => string }).toString === "function"
        ? (value as { toString: () => string }).toString()
        : "";
    }
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "bigint") return value.toString();
    return "";
  }

  private async loadHierarchyRoles(): Promise<HierarchyRole[]> {
    const allRoles = await RoleModel.find()
      .select("_id name reportsTo")
      .lean();
    return allRoles.map((r) => ({
      _id: r._id.toString(),
      name: r.name,
      reportsTo: r.reportsTo?.toString() ?? null,
    }));
  }

  private async getSettings() {
    const settings = await DisciplinarySettingsModel.findOne().lean();
    if (!settings) {
      throw new AppError("Disciplinary settings have not been configured", 400);
    }
    return settings;
  }

  private getCutoffDate(rollingPeriodDays: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rollingPeriodDays);
    return cutoff;
  }

  async getActivePoints(employeeId: string): Promise<number> {
    const settings = await this.getSettings();
    const cutoff = this.getCutoffDate(settings.rollingPeriodDays);

    const incidents = await repo.findActiveByEmployeeId(employeeId, cutoff);
    return incidents.reduce((sum, i) => sum + i.totalPoints, 0);
  }

  deriveStatus(
    activePoints: number,
    guidelines: IDisciplineGuideline[],
    pointsToTermination: number,
  ): DisciplinaryStatus {
    const { firstThreshold, atRiskThreshold, criticalThreshold } =
      this.getStatusThresholds(guidelines, pointsToTermination);

    if (activePoints >= criticalThreshold) return "Critical";
    if (atRiskThreshold != null && activePoints >= atRiskThreshold) return "At Risk";
    if (firstThreshold != null && activePoints >= firstThreshold) return "Caution";
    return "Good Standing";
  }

  getRequiredProtocol(
    activePoints: number,
    guidelines: IDisciplineGuideline[],
  ): { currentAction: string; message: string } {
    const sorted = [...guidelines].sort(
      (a, b) => a.pointThreshold - b.pointThreshold,
    );

    let currentAction = "No action required";
    let currentThreshold: number | null = null;

    for (const g of sorted) {
      if (activePoints >= g.pointThreshold) {
        currentAction = g.action;
        currentThreshold = g.pointThreshold;
      }
    }

    const message = currentThreshold == null
      ? "Based on the current point total, no protocol is required."
      : `Based on the ${currentThreshold} point threshold, the required action is:`;

    return {
      currentAction,
      message,
    };
  }

  private resolveEmployeeLocations(
    emp: { roleId?: { locationAccess?: string; locationIds?: unknown[] }; locationOverrides?: unknown[]; locationRemovals?: unknown[] },
  ): string[] | "all" {
    const role = emp.roleId as { locationAccess?: string; locationIds?: unknown[] } | undefined;
    if (!role) return [];

    const roleLocationIds = (role.locationIds ?? [])
      .map((entry) => this.locationIdEntryToString(entry))
      .filter(Boolean);

    // Match effective-access semantics used elsewhere:
    // non-specific roles (or specific with empty locations) mean global location access.
    if (role.locationAccess !== "specific" || roleLocationIds.length === 0) {
      return "all";
    }

    const effective = new Set(roleLocationIds);
    for (const entry of emp.locationOverrides ?? []) {
      const id = this.locationIdEntryToString(entry);
      if (id) effective.add(id);
    }
    for (const entry of emp.locationRemovals ?? []) {
      const id = this.locationIdEntryToString(entry);
      if (id) effective.delete(id);
    }

    return [...effective];
  }

  async getEmployeesForLocation(
    actorUserId: string,
    locationId: string,
    options: { page?: number; limit?: number; search?: string } = {},
  ): Promise<{
    items: DisciplinaryEmployeeListItem[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      criticalCount: number;
      pendingCount: number;
      totalActive: number;
    };
  }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 10));
    const searchQuery = options.search?.trim().toLowerCase() ?? "";
    const actor = await UserModel.findById(actorUserId)
      .select("roleId")
      .lean();
    if (!actor?.roleId) {
      return {
        items: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 1,
          criticalCount: 0,
          pendingCount: 0,
          totalActive: 0,
        },
      };
    }

    const actorRoleIdStr = actor.roleId.toString();
    const hierarchyRoles = await this.loadHierarchyRoles();
    const descendantRoleIds = getDescendantRoleIds(
      actorRoleIdStr,
      hierarchyRoles,
    );
    if (descendantRoleIds.length === 0) {
      return {
        items: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 1,
          criticalCount: 0,
          pendingCount: 0,
          totalActive: 0,
        },
      };
    }

    const employees = await UserModel.find({
      roleId: { $in: descendantRoleIds },
      isActive: true,
      isTerminated: { $ne: true },
    })
      .select(
        "_id firstName lastName email roleId profileImagePublicId locationOverrides locationRemovals",
      )
      .populate("roleId", "name locationAccess locationIds")
      .lean();

    const settings = await this.getSettings();
    const cutoff = this.getCutoffDate(settings.rollingPeriodDays);

    const normalizedLocationId = this.locationIdEntryToString(locationId);
    const locationMatched: typeof employees = [];
    for (const emp of employees) {
      const empLocs = this.resolveEmployeeLocations(emp as unknown as Record<string, unknown>);
      if (empLocs !== "all" && !empLocs.includes(normalizedLocationId)) continue;
      locationMatched.push(emp);
    }

    const searchMatched: { empIdStr: string; employeeName: string; roleName: string }[] = [];
    for (const emp of locationMatched) {
      const roleName =
        (emp.roleId as unknown as { name?: string })?.name ?? "Unknown";
      const firstName = (emp as unknown as { firstName?: string }).firstName ?? "";
      const lastName = (emp as unknown as { lastName?: string }).lastName ?? "";
      const employeeName = `${firstName} ${lastName}`.trim();
      if (
        searchQuery &&
        !employeeName.toLowerCase().includes(searchQuery) &&
        !roleName.toLowerCase().includes(searchQuery)
      ) {
        continue;
      }
      searchMatched.push({
        empIdStr: emp._id.toString(),
        employeeName,
        roleName,
      });
    }

    const batchIds = searchMatched.map((r) => r.empIdStr);
    const [activePointsByEmp, pendingByEmp, maxDateByEmp] = await Promise.all([
      repo.aggregateActivePointsByEmployeeIds(batchIds, cutoff),
      repo.aggregatePendingSignatureCountsByEmployeeIds(batchIds),
      repo.aggregateMaxIncidentDateByEmployeeIds(batchIds),
    ]);

    const result: DisciplinaryEmployeeListItem[] = searchMatched.map(
      ({ empIdStr, employeeName, roleName }) => {
        const activePoints = activePointsByEmp.get(empIdStr) ?? 0;
        const pendingCount = pendingByEmp.get(empIdStr) ?? 0;
        const maxD = maxDateByEmp.get(empIdStr);
        const mostRecent = maxD ? maxD.toISOString() : null;
        return {
          id: empIdStr,
          name: employeeName,
          role: roleName,
          activePoints,
          mostRecentIncidentDate: mostRecent,
          status: this.deriveStatus(
            activePoints,
            settings.disciplineGuidelines,
            settings.pointsToTermination,
          ),
          eSignStatus:
            pendingCount > 0
              ? { type: "pending", count: pendingCount }
              : { type: "compliant" },
        };
      },
    );

    const total = result.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const items = result.slice(start, start + limit);
    const criticalCount = result.filter((employee) => employee.status === "Critical").length;
    const pendingCount = result.reduce(
      (sum, employee) => sum + (employee.eSignStatus.type === "pending" ? employee.eSignStatus.count : 0),
      0,
    );

    return {
      items,
      meta: {
        total,
        page: safePage,
        limit,
        totalPages,
        criticalCount,
        pendingCount,
        totalActive: total,
      },
    };
  }

  async getEmployeeDetails(actorUserId: string, employeeId: string) {
    const actor = await UserModel.findById(actorUserId)
      .select("roleId")
      .lean();
    if (!actor?.roleId) throw new AppError("Actor not found", 404);

    const employee = await UserModel.findById(employeeId)
      .select(
        "_id firstName lastName email roleId profileImagePublicId",
      )
      .populate("roleId", "name")
      .lean();
    if (!employee) throw new AppError("Employee not found", 404);

    const hierarchyRoles = await this.loadHierarchyRoles();
    const actorRoleIdStr = actor.roleId.toString();
    const empRoleIdStr = (employee.roleId as unknown as { _id: Types.ObjectId })._id.toString();

    if (
      actorRoleIdStr === empRoleIdStr ||
      !isAncestorOf(actorRoleIdStr, empRoleIdStr, hierarchyRoles)
    ) {
      throw new AppError(
        "You do not have permission to view this employee's disciplinary records",
        403,
      );
    }

    const settings = await this.getSettings();
    const activePoints = await this.getActivePoints(employeeId);
    const protocol = this.getRequiredProtocol(
      activePoints,
      settings.disciplineGuidelines,
    );
    const status = this.deriveStatus(
      activePoints,
      settings.disciplineGuidelines,
      settings.pointsToTermination,
    );

    const { incidents, total } = await repo.findByEmployeeId(employeeId);
    const signedDocs = await repo.findSignedDocuments(employeeId);

    const roleName =
      (employee.roleId as unknown as { name?: string })?.name ?? "Unknown";
    const firstName = (employee as unknown as { firstName?: string }).firstName ?? "";
    const lastName = (employee as unknown as { lastName?: string }).lastName ?? "";

    return {
      employee: {
        id: employeeId,
        name: `${firstName} ${lastName}`.trim(),
        role: roleName,
        status,
        activePoints,
        pointsThreshold: settings.pointsToTermination,
        avatarUrl: undefined,
      },
      protocol,
      incidents,
      totalIncidents: total,
      documents: signedDocs,
      settings: {
        rollingPeriodDays: settings.rollingPeriodDays,
        pointsToTermination: settings.pointsToTermination,
        guidelines: settings.disciplineGuidelines,
      },
    };
  }

  private async generateIncidentPdfBuffer(params: {
    incident: IDisciplinaryIncident;
    settings: Awaited<ReturnType<DisciplinaryIncidentService["getSettings"]>>;
    managerName: string;
    employeeName: string;
    employeeRole: string;
  }): Promise<Buffer> {
    const { incident, settings, managerName, employeeName, employeeRole } = params;
    const pdfSvc = new PdfGeneratorService();
    const sectionTitle = (sectionId: string) =>
      settings.policySections.find((s) => s.id === sectionId)?.name ?? "";
    const locationId = this.toIdString(incident.locationId);
    const location = locationId
      ? await LocationModel.findById(locationId).select("storeName").lean()
      : null;
    const locationName = location?.storeName?.trim() || "—";
    let immediateTerminationPoliciesForPdf:
      NonNullable<IDisciplinaryIncident["immediateTerminationPolicies"]> = [];
    if (incident.immediateTerminationPolicies?.length) {
      immediateTerminationPoliciesForPdf = incident.immediateTerminationPolicies;
    } else if (incident.immediateTerminationPolicy) {
      immediateTerminationPoliciesForPdf = [incident.immediateTerminationPolicy];
    }

    return pdfSvc.generateIncidentReport({
      companyName: process.env.COMPANY_NAME?.trim() || "Tikka Brands",
      employeeName,
      employeeRole,
      locationName,
      managerName,
      incidentDate: new Date(incident.incidentDate).toISOString().slice(0, 10),
      appliedPolicies: incident.appliedPolicies.map((p) => ({
        title: p.title,
        description: p.description,
        points: p.points,
        sectionName: sectionTitle(p.sectionId),
      })),
      isImmediateTermination: incident.isImmediateTermination,
      totalPoints: incident.totalPoints,
      detailsOfIncident: incident.detailsOfIncident,
      supervisorCommitment: incident.supervisorCommitment,
      supervisorComments: incident.supervisorComments,
      ...(incident.associateCommitment
        ? { associateCommitment: incident.associateCommitment }
        : {}),
      ...(incident.associateComments
        ? { associateComments: incident.associateComments }
        : {}),
      guidelines: settings.disciplineGuidelines.map((g) => ({
        pointThreshold: g.pointThreshold,
        action: g.action,
      })),
      ...(immediateTerminationPoliciesForPdf.length
        ? { immediateTerminationPolicies: immediateTerminationPoliciesForPdf }
        : {}),
      ...(incident.positiveResults
        ? { positiveResults: incident.positiveResults }
        : {}),
      ...(incident.negativeConsequences
        ? { negativeConsequences: incident.negativeConsequences }
        : {}),
    });
  }

  async createIncident(
    actorUserId: string,
    data: {
      employeeId: string;
      locationId: string;
      appliedPolicies: IDisciplinaryIncident["appliedPolicies"];
      isImmediateTermination: boolean;
      immediateTerminationPolicies?: IDisciplinaryIncident["immediateTerminationPolicies"];
      immediateTerminationPolicy?: IDisciplinaryIncident["immediateTerminationPolicy"];
      detailsOfIncident: string;
      supervisorCommitment: string;
      supervisorComments: string;
      associateCommitment?: string;
      associateComments?: string;
      positiveResults?: string;
      negativeConsequences?: string;
      incidentDate?: string;
    },
  ) {
    const actor = await UserModel.findById(actorUserId)
      .select("roleId email firstName lastName")
      .lean();
    if (!actor?.roleId) throw new AppError("Actor not found", 404);

    const employee = await UserModel.findById(data.employeeId)
      .select("roleId email firstName lastName")
      .populate("roleId", "name")
      .lean();
    if (!employee) throw new AppError("Employee not found", 404);

    const hierarchyRoles = await this.loadHierarchyRoles();
    const actorRoleIdStr = actor.roleId.toString();
    const empRoleIdStr = (employee.roleId as unknown as { _id: Types.ObjectId })._id.toString();

    if (
      actorRoleIdStr === empRoleIdStr ||
      !isAncestorOf(actorRoleIdStr, empRoleIdStr, hierarchyRoles)
    ) {
      throw new AppError(
        "You can only assign disciplinary points to employees whose role is below yours in the hierarchy",
        403,
      );
    }

    const totalPoints = data.appliedPolicies.reduce(
      (sum, p) => sum + p.points,
      0,
    );

    const settings = await this.getSettings();

    const incident = await repo.create({
      employeeId: new Types.ObjectId(data.employeeId),
      reportedBy: new Types.ObjectId(actorUserId),
      locationId: new Types.ObjectId(data.locationId),
      appliedPolicies: data.appliedPolicies,
      isImmediateTermination: data.isImmediateTermination,
      immediateTerminationPolicies: data.immediateTerminationPolicies ?? [],
      immediateTerminationPolicy:
        data.immediateTerminationPolicy ?? data.immediateTerminationPolicies?.[0],
      totalPoints,
      detailsOfIncident: data.detailsOfIncident,
      supervisorCommitment: data.supervisorCommitment,
      supervisorComments: data.supervisorComments,
      associateCommitment: data.associateCommitment,
      associateComments: data.associateComments,
      positiveResults: data.positiveResults,
      negativeConsequences: data.negativeConsequences,
      signingStatus: "pending_manager",
      incidentDate: data.incidentDate
        ? new Date(data.incidentDate)
        : new Date(),
    });

    // Create and upload an initial PDF snapshot immediately after points are assigned.
    try {
      const managerName =
        `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim();
      const employeeName =
        `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
      const employeeRole =
        (employee.roleId as unknown as { name?: string } | undefined)?.name ?? "";
      const pdfBuffer = await this.generateIncidentPdfBuffer({
        incident: incident as unknown as IDisciplinaryIncident,
        settings,
        managerName,
        employeeName,
        employeeRole,
      });
      const incidentId = incident._id.toString();
      const folder = getDisciplinaryFolder(data.employeeId);
      const upload = await uploadToCloudinary(
        { buffer: pdfBuffer, mimetype: "application/pdf" },
        folder,
        { resource_type: "raw", public_id: `signed_${incidentId}` },
      );
      await repo.updateById(incidentId, { signedDocumentPublicId: upload.public_id });
    } catch (err) {
      logger.warn("Initial disciplinary PDF upload failed", {
        incidentId: incident._id?.toString?.() ?? String(incident._id),
        employeeId: data.employeeId,
        err,
      });
    }

    return incident;
  }

  /**
   * Invoked when the manager completes Adobe Sign. DB row must still be `pending_manager`.
   * Sets status to `pending_employee`, counts points toward rolling totals, notifies ascendants
   * on threshold crossings, and sends the employee SMS + in-app to check email for signing.
   */
  async handleManagerSignedDisciplinaryIncident(
    incident: {
      _id: Types.ObjectId | string;
      employeeId: Types.ObjectId | string;
      locationId: Types.ObjectId | string;
      totalPoints: number;
      adobeAgreementId?: string;
      reportedBy?: Types.ObjectId | string;
    },
  ): Promise<void> {
    const incidentId = incident._id.toString();
    const employeeId = incident.employeeId.toString();
    const locationId = incident.locationId.toString();

    const previousPoints = await this.getActivePoints(employeeId);
    const newPoints = previousPoints + incident.totalPoints;

    const transitioned = await DisciplinaryIncidentModel.findOneAndUpdate(
      { _id: incidentId, signingStatus: "pending_manager" },
      { $set: { signingStatus: "pending_employee", managerSignedAt: new Date() } },
      { new: true },
    ).lean();
    if (!transitioned) {
      logger.info("Skipping duplicate manager-signed webhook event", {
        incidentId,
      });
      return;
    }

    const assignerId = incident.reportedBy?.toString();
    if (assignerId) {
      try {
        await notificationService.send({
          recipientId: assignerId,
          type: "disciplinary_manager_signed",
          title: "Manager signature completed",
          message: `Your manager signature was recorded for incident #${incidentId.slice(-6)}.`,
          data: { incidentId, employeeId },
          channels: ["in_app"],
        });
      } catch (err) {
        logger.warn("Failed to notify assigner after manager signed", {
          assignerId,
          incidentId,
          err,
        });
      }
    }

    // Refresh the incident PDF snapshot after manager signature.
    if (incident.adobeAgreementId) {
      try {
        const adobeSignService = getAdobeSignService();
        const signedPdf = await adobeSignService.getSignedDocument(
          incident.adobeAgreementId,
        );
        const folder = getDisciplinaryFolder(employeeId);
        const signedUpload = await uploadToCloudinary(
          { buffer: signedPdf, mimetype: "application/pdf" },
          folder,
          { resource_type: "raw", public_id: `signed_${incidentId}` },
        );
        await repo.updateById(incidentId, {
          signedDocumentPublicId: signedUpload.public_id,
        });
      } catch (err) {
        logger.warn("Failed to upload manager-signed PDF snapshot", {
          incidentId,
          agreementId: incident.adobeAgreementId,
          err,
        });
      }
    }

    const employee = await UserModel.findById(employeeId)
      .select("roleId firstName lastName")
      .lean();
    if (!employee?.roleId) {
      logger.warn("handleManagerSigned: employee or role missing", {
        employeeId,
      });
      return;
    }

    const hierarchyRoles = await this.loadHierarchyRoles();
    const empRoleIdStr =
      (employee.roleId as unknown as Types.ObjectId).toString();

    await this.checkAndNotifyThresholdCrossing(
      employeeId,
      empRoleIdStr,
      locationId,
      previousPoints,
      newPoints,
      hierarchyRoles,
      employee as unknown as { firstName?: string; lastName?: string },
    );

    const smsBody =
      "Tikka Spice: A disciplinary document was sent to your email. Please check your inbox and complete your Adobe Sign signature.";

    try {
      await notificationService.send({
        recipientId: employeeId,
        type: "disciplinary_employee_sign_pending",
        title: "Disciplinary document — check your email",
        message:
          "A disciplinary document requires your signature. Please check your email for the Adobe Sign link.",
        data: { incidentId, locationId },
        channels: ["sms", "in_app"],
        smsBody,
      });
    } catch (err) {
      logger.error("Failed to notify employee after manager signed", {
        employeeId,
        incidentId,
        err,
      });
    }
  }

  private async checkAndNotifyThresholdCrossing(
    employeeId: string,
    employeeRoleId: string,
    locationId: string,
    previousPoints: number,
    newPoints: number,
    hierarchyRoles: HierarchyRole[],
    employee: { firstName?: string; lastName?: string },
  ): Promise<void> {
    const settings = await this.getSettings();
    const sorted = [...settings.disciplineGuidelines].sort(
      (a, b) => a.pointThreshold - b.pointThreshold,
    );

    const crossedGuidelines = sorted.filter(
      (g) =>
        newPoints >= g.pointThreshold && previousPoints < g.pointThreshold,
    );

    if (crossedGuidelines.length === 0) return;

    const highestCrossed = crossedGuidelines.at(-1)!;
    const empName =
      `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
    const currentStatus = this.deriveStatus(
      newPoints,
      settings.disciplineGuidelines,
      settings.pointsToTermination,
    );

    try {
      const ancestorRoleIds = getAncestorRoleIds(
        employeeRoleId,
        hierarchyRoles,
      );
      if (ancestorRoleIds.length === 0) return;

      const ancestorUsers = await UserModel.find({
        roleId: { $in: ancestorRoleIds },
        isActive: true,
        isTerminated: { $ne: true },
      })
        .select("_id roleId locationOverrides locationRemovals")
        .populate("roleId", "locationAccess locationIds")
        .lean();

      for (const user of ancestorUsers) {
        const userLocs = this.resolveEmployeeLocations(
          user as unknown as Record<string, unknown>,
        );
        if (userLocs !== "all" && !userLocs.includes(locationId)) continue;

        await notificationService.send({
          recipientId: user._id.toString(),
          type: "disciplinary_threshold_crossed",
          title: "Disciplinary Threshold Crossed",
          message: `${empName} has reached ${newPoints} disciplinary points. Status: ${currentStatus}. Required action: ${highestCrossed.action}.`,
          data: {
            employeeId,
            employeeName: empName,
            newPoints,
            status: currentStatus,
            thresholdCrossed: highestCrossed.pointThreshold,
            action: highestCrossed.action,
            locationId,
          },
          channels: ["all"],
          emailTemplateFile: "disciplinary-notification-email.ejs",
          emailTemplateData: {
            employeeName: empName,
            points: newPoints,
            action: highestCrossed.action,
            threshold: highestCrossed.pointThreshold,
          },
        });
      }
    } catch (err) {
      logger.error("Failed to send disciplinary threshold notifications", {
        employeeId,
        err,
      });
    }
  }

  async getIncidentsForEmployee(
    employeeId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    return repo.findByEmployeeId(employeeId, options);
  }

  async updateIncidentSigning(
    incidentId: string,
    data: Record<string, unknown>,
  ) {
    return repo.updateById(incidentId, data);
  }

  async findIncidentByAgreementId(agreementId: string) {
    return repo.findByAgreementId(agreementId);
  }

  private async ensureAdobeAgreementForIncident(
    incident: IDisciplinaryIncident & { _id: string | Types.ObjectId },
    employeeId: string,
  ): Promise<string> {
    if (incident.adobeAgreementId) return incident.adobeAgreementId;

    const incidentId = incident._id.toString();
    const settings = await this.getSettings();

    let adobeSignService;
    try {
      adobeSignService = getAdobeSignService();
    } catch {
      throw new AppError(
        "Adobe Sign is not configured. Set ADOBE_SIGN_INTEGRATION_KEY and ADOBE_SIGN_BASE_URI on the API server.",
        503,
      );
    }

    const managerId = this.toIdString(incident.reportedBy);
    if (!managerId) {
      throw new AppError("Incident assigner was not found for this record.", 400);
    }
    const manager = await UserModel.findById(managerId)
      .select("email firstName lastName")
      .lean();
    const emp = await UserModel.findById(employeeId)
      .select("email firstName lastName")
      .populate("roleId", "name")
      .lean();

    const managerEmail = manager?.email?.trim();
    const employeeEmail = emp?.email?.trim();
    if (!managerEmail || !employeeEmail) {
      throw new AppError(
        "Manager and employee must have email addresses on file to use Adobe Sign.",
        400,
      );
    }

    const employeeRole =
      (emp?.roleId as unknown as { name?: string } | undefined)?.name ?? "";
    const managerName =
      `${manager?.firstName ?? ""} ${manager?.lastName ?? ""}`.trim();
    const employeeName =
      `${emp?.firstName ?? ""} ${emp?.lastName ?? ""}`.trim();
    const filename = `PIP_${this.toSafeFileToken(employeeName)}_${this.toDateToken(incident.incidentDate)}.pdf`;

    const pdfBuffer = await this.generateIncidentPdfBuffer({
      incident,
      settings,
      managerName,
      employeeName,
      employeeRole,
    });

    const transientId = await adobeSignService.uploadTransientDocument(
      pdfBuffer,
      filename,
    );

    const agreementId = await adobeSignService.createAgreement(
      transientId,
      managerEmail,
      employeeEmail,
      `Performance Improvement Plan (PIP) — ${employeeName} (${incidentId.slice(-6)})`,
    );

    const publicApi = process.env.API_PUBLIC_URL?.trim().replace(/\/$/, "");
    if (publicApi?.startsWith("https://")) {
      try {
        await adobeSignService.registerWebhook(
          agreementId,
          `${publicApi}/api/webhooks/adobe-sign`,
        );
      } catch (err) {
        const error_ = err as Error & { response?: { status?: number; data?: unknown } };
        logger.warn("Adobe Sign webhook registration failed", {
          agreementId,
          errMessage: error_?.message,
          errStack: error_?.stack,
          status: error_?.response?.status,
          response: error_?.response?.data,
        });
      }
    } else {
      logger.warn(
        "API_PUBLIC_URL is not a public https base URL; webhooks were not registered for this agreement",
      );
    }

    await repo.updateById(incidentId, { adobeAgreementId: agreementId });
    return agreementId;
  }

  /**
   * Create an Acrobat Sign agreement (if needed), register webhooks when API_PUBLIC_URL is https,
   * and return an embedded signing URL for the manager. The employee receives the usual email for round 2.
   */
  async sendDisciplinaryIncidentForSignature(
    actorUserId: string,
    employeeId: string,
  ): Promise<{
    incidentId: string;
    adobeAgreementId: string;
    embeddedSignUrl: string;
  }> {
    const actor = await UserModel.findById(actorUserId)
      .select("roleId")
      .lean();
    if (!actor?.roleId) throw new AppError("Actor not found", 404);

    const employee = await UserModel.findById(employeeId)
      .select("roleId")
      .lean();
    if (!employee?.roleId) throw new AppError("Employee not found", 404);

    const hierarchyRoles = await this.loadHierarchyRoles();
    const actorRoleIdStr = actor.roleId.toString();
    const empRoleIdStr = String(employee.roleId);

    if (
      actorRoleIdStr === empRoleIdStr ||
      !isAncestorOf(actorRoleIdStr, empRoleIdStr, hierarchyRoles)
    ) {
      throw new AppError(
        "You do not have permission to send documents for this employee",
        403,
      );
    }

    const incident = await repo.findLatestPendingManagerForEmployee(employeeId);
    if (!incident) {
      throw new AppError(
        "No incident is waiting for the manager’s signature for this employee.",
        400,
      );
    }

    const incidentId = incident._id.toString();
    const clientUrl = (
      process.env.CLIENT_URL ?? "http://localhost:5173"
    ).replace(/\/$/, "");
    const returnUrl = `${clientUrl}/adobe-sign-embedded-return.html`;

    const agreementId = await this.ensureAdobeAgreementForIncident(
      incident as unknown as IDisciplinaryIncident & { _id: string | Types.ObjectId },
      employeeId,
    );

    let adobeSignService;
    try {
      adobeSignService = getAdobeSignService();
    } catch {
      throw new AppError(
        "Adobe Sign is not configured. Set ADOBE_SIGN_INTEGRATION_KEY and ADOBE_SIGN_BASE_URI on the API server.",
        503,
      );
    }

    const embeddedSignUrl = await adobeSignService.createEmbeddedSigningView(
      agreementId,
      { returnUrl, frameParent: clientUrl },
    );

    await repo.updateById(incidentId, { managerSigningUrl: embeddedSignUrl });

    return {
      incidentId,
      adobeAgreementId: agreementId,
      embeddedSignUrl,
    };
  }

  async getDisciplinaryIncidentEmbeddedSignUrl(
    actorUserId: string,
    incidentId: string,
  ): Promise<{ embeddedSignUrl: string }> {
    const incident = await repo.findById(incidentId);
    if (!incident) throw new AppError("Incident not found", 404);

    if (incident.signingStatus !== "pending_manager") {
      throw new AppError(
        "Embedded signing is only available while the manager’s signature is pending.",
        400,
      );
    }

    const rawEmp = incident.employeeId as unknown;
    const managedEmployeeId =
      rawEmp &&
      typeof rawEmp === "object" &&
      "_id" in rawEmp
        ? String((rawEmp as { _id: Types.ObjectId })._id)
        : String(rawEmp);

    const actor = await UserModel.findById(actorUserId)
      .select("roleId")
      .lean();
    if (!actor?.roleId) throw new AppError("Actor not found", 404);

    const employee = await UserModel.findById(managedEmployeeId)
      .select("roleId")
      .lean();
    if (!employee?.roleId) throw new AppError("Employee not found", 404);

    const hierarchyRoles = await this.loadHierarchyRoles();
    const actorRoleIdStr = actor.roleId.toString();
    const empRoleIdStr = String(employee.roleId);

    if (
      actorRoleIdStr === empRoleIdStr ||
      !isAncestorOf(actorRoleIdStr, empRoleIdStr, hierarchyRoles)
    ) {
      throw new AppError("Forbidden", 403);
    }

    // Only the original assigner/reporter can perform the manager signature.
    const assignerUserId = this.toIdString(incident.reportedBy);
    if (!assignerUserId || assignerUserId !== actorUserId) {
      throw new AppError(
        "Only the user who assigned the points can sign this disciplinary document as manager.",
        403,
      );
    }

    const clientUrl = (
      process.env.CLIENT_URL ?? "http://localhost:5173"
    ).replace(/\/$/, "");
    const returnUrl = `${clientUrl}/adobe-sign-embedded-return.html`;

    let adobeSignService;
    try {
      adobeSignService = getAdobeSignService();
    } catch {
      throw new AppError(
        "Adobe Sign is not configured. Set ADOBE_SIGN_INTEGRATION_KEY and ADOBE_SIGN_BASE_URI on the API server.",
        503,
      );
    }

    const agreementId = await this.ensureAdobeAgreementForIncident(
      incident as unknown as IDisciplinaryIncident & { _id: string | Types.ObjectId },
      managedEmployeeId,
    );

    const embeddedSignUrl = await adobeSignService.createEmbeddedSigningView(
      agreementId,
      { returnUrl, frameParent: clientUrl },
    );

    await repo.updateById(incidentId, { managerSigningUrl: embeddedSignUrl });

    return { embeddedSignUrl };
  }
}

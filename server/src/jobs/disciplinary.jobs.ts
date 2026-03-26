import type { Agenda } from "agenda";
import { DisciplinarySettingsModel } from "../models/disciplinarySettings.model.js";
import { DisciplinaryIncidentRepository } from "../repositories/disciplinaryIncident.repository.js";
import { DisciplinaryIncidentService } from "../services/disciplinaryIncident.service.js";
import { UserModel } from "../models/user.model.js";
import { RoleModel } from "../models/role.model.js";
import { NotificationService } from "../services/notification.service.js";
import { getAncestorRoleIds } from "../utils/roleHierarchy.util.js";
import type { HierarchyRole } from "../utils/roleHierarchy.util.js";
import { logger } from "../utils/logger.util.js";

const repo = new DisciplinaryIncidentRepository();
const incidentService = new DisciplinaryIncidentService();
const notificationService = new NotificationService();

async function loadHierarchyRoles(): Promise<HierarchyRole[]> {
  const allRoles = await RoleModel.find().select("_id name reportsTo").lean();
  return allRoles.map((r) => ({
    _id: r._id.toString(),
    name: r.name,
    reportsTo: r.reportsTo?.toString() ?? null,
  }));
}

export function registerDisciplinaryJobs(agenda: Agenda): void {
  agenda.define("disciplinary:check-expiry", async (_job) => {
    logger.info("Job: disciplinary:check-expiry - running");

    const settings = await DisciplinarySettingsModel.findOne().lean();
    if (!settings) {
      logger.info("Job: disciplinary:check-expiry - no settings configured, skipping");
      return;
    }

    const now = new Date();
    const cutoffEnd = new Date(now);
    cutoffEnd.setDate(cutoffEnd.getDate() - settings.rollingPeriodDays);

    const cutoffStart = new Date(cutoffEnd);
    cutoffStart.setDate(cutoffStart.getDate() - 1);

    const expiringIncidents = await repo.findIncidentsExpiringInWindow(
      cutoffStart,
      cutoffEnd,
    );

    if (expiringIncidents.length === 0) return;

    const affectedEmployeeIds = [
      ...new Set(expiringIncidents.map((i) => i.employeeId.toString())),
    ];

    const hierarchyRoles = await loadHierarchyRoles();

    for (const employeeId of affectedEmployeeIds) {
      try {
        const activePoints = await incidentService.getActivePoints(employeeId);

        const employee = await UserModel.findById(employeeId)
          .select("firstName lastName roleId")
          .populate("roleId", "name")
          .lean();
        if (!employee) continue;

        const empRoleId = (
          employee.roleId as unknown as { _id: { toString(): string } }
        )._id.toString();
        const empName =
          `${(employee as unknown as { firstName?: string }).firstName ?? ""} ${(employee as unknown as { lastName?: string }).lastName ?? ""}`.trim();

        const ancestorRoleIds = getAncestorRoleIds(
          empRoleId,
          hierarchyRoles,
        );
        if (ancestorRoleIds.length === 0) continue;

        const ancestorUsers = await UserModel.find({
          roleId: { $in: ancestorRoleIds },
          isActive: true,
          isTerminated: { $ne: true },
        })
          .select("_id")
          .lean();

        for (const user of ancestorUsers) {
          await notificationService.send({
            recipientId: user._id.toString(),
            type: "disciplinary_points_expired",
            title: "Disciplinary Points Expired",
            message: `Some disciplinary points for ${empName} have expired. Current active points: ${activePoints}.`,
            data: { employeeId, employeeName: empName, activePoints },
            channels: ["all"],
          });
        }

        logger.info("Disciplinary points expired notification sent", {
          employeeId,
          activePoints,
          recipientCount: ancestorUsers.length,
        });
      } catch (err) {
        logger.error("disciplinary:check-expiry error for employee", {
          employeeId,
          err,
        });
      }
    }
  });
}

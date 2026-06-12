import mongoose from "mongoose";
import { DisciplinaryIncidentModel } from "../models/disciplinaryIncident.model.js";
import type {
  AlertEntityCadence,
  IAlertNotificationSettings,
  IAlertRoleBinding,
} from "../types/alertNotification.types.js";
import type { NotificationType } from "../types/notification.types.js";
import type { IAssignmentListItem } from "../types/trainingAssignment.types.js";
import { TrainingAssignmentService } from "../services/trainingAssignment.service.js";
import { UserService } from "../services/user.service.js";
import { assignmentHasOverdueModule } from "./trainingOverdue.util.js";
import { intervalMinutesForSchedule, shouldRunAlertScheduleTick } from "./alertScheduleRun.util.js";
import { buildFireTimeKey } from "./alertFireTimeKey.util.js";
import { getTodayInTimezoneAt } from "./timezone.util.js";
import {
  computeAlertEntityCadenceSendPlan,
  toAlertEntityCadenceSnapshot,
} from "./alertEntityCadence.util.js";
import {
  loadAlertEntityCadenceStateMap,
  persistAlertEntityCadenceEpisodeState,
  resetAllActiveAlertEntityCadenceStates,
  resolveStaleAlertEntityCadenceStates,
} from "./alertEntityCadenceState.util.js";

export type ReputationHrAlertDispatchPayload = {
  settings: IAlertNotificationSettings;
  locationId: string;
  storeName: string;
  category: IAlertRoleBinding["category"];
  roleBindingSubcategory: string;
  type: NotificationType;
  title: string;
  message: string;
  alertKind: string;
  severity: "warning" | "critical";
  fireKey: string;
  data: Record<string, unknown>;
};

const trainingAssignmentService = new TrainingAssignmentService();
const userService = new UserService();

function isOverdueTrainingAssignment(row: IAssignmentListItem): boolean {
  if (row.status === "Complete") {
    return false;
  }
  return assignmentHasOverdueModule(row.assignedAt, row.moduleDurations, row.moduleProgress);
}

async function listOverdueTrainingAssignmentsForLocation(
  locationId: string,
): Promise<IAssignmentListItem[]> {
  const { list } = await trainingAssignmentService.listByLocationId(locationId);
  return list.filter(isOverdueTrainingAssignment);
}

async function listPendingPipIncidentsForLocation(
  locationId: string,
): Promise<Array<{ incidentId: string; signingStatus: string }>> {
  const employeeIds = await userService.getUserIdsWithAccessToLocation(locationId);
  if (employeeIds.length === 0) {
    return [];
  }
  const oids = employeeIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await DisciplinaryIncidentModel.find({
    employeeId: { $in: oids },
    signingStatus: { $in: ["pending_manager", "pending_employee"] },
  })
    .select("_id signingStatus")
    .lean()
    .exec();
  return rows.map((r) => ({
    incidentId: String(r._id),
    signingStatus: String(r.signingStatus ?? ""),
  }));
}

async function appendEntityCadenceAlerts<T extends { entityId: string }>(params: {
  out: ReputationHrAlertDispatchPayload[];
  locationId: string;
  storeLabel: string;
  settings: IAlertNotificationSettings;
  cadence: AlertEntityCadence;
  alertKind: "training_overdue" | "pip_pending";
  entities: T[];
  entityKeyPrefix: string;
  timezone: string;
  tickAnchorMs: number;
  tickFireKey: string;
  buildPayload: (entity: T, fireKey: string) => ReputationHrAlertDispatchPayload;
}): Promise<void> {
  if (params.entities.length === 0) {
    await resetAllActiveAlertEntityCadenceStates(params.locationId, params.alertKind);
    return;
  }

  const entityIds = params.entities.map((e) => e.entityId);
  const activeSet = new Set(entityIds);
  await resolveStaleAlertEntityCadenceStates(params.locationId, params.alertKind, activeSet);
  const stateByEntityId = await loadAlertEntityCadenceStateMap(
    params.locationId,
    params.alertKind,
    entityIds,
  );
  const dayKey = getTodayInTimezoneAt(params.timezone, params.tickAnchorMs);

  for (const entity of params.entities) {
    const prev = stateByEntityId.get(entity.entityId);
    const plan = computeAlertEntityCadenceSendPlan(
      params.cadence,
      toAlertEntityCadenceSnapshot(prev),
      dayKey,
      params.tickFireKey,
      params.tickAnchorMs,
      `${params.entityKeyPrefix}:${entity.entityId}`,
    );

    if (params.cadence === "once_per_episode") {
      await persistAlertEntityCadenceEpisodeState({
        locationId: params.locationId,
        alertKind: params.alertKind,
        entityId: entity.entityId,
        tickAnchorMs: params.tickAnchorMs,
        plan,
      });
    }

    if (!plan.shouldSend) {
      continue;
    }

    params.out.push(params.buildPayload(entity, plan.fireKey));
  }
}

async function appendTrainingOverduePayloadsIfDue(
  out: ReputationHrAlertDispatchPayload[],
  params: {
    settings: IAlertNotificationSettings;
    reputationHr: IAlertNotificationSettings["reputationHr"];
    locationId: string;
    timezone: string;
    tickAnchorMs: number;
    storeLabel: string;
  },
): Promise<void> {
  if (!params.reputationHr.trainingOverdue) {
    return;
  }
  const run = params.reputationHr.trainingRun;
  if (!shouldRunAlertScheduleTick(run, params.timezone, params.tickAnchorMs)) {
    return;
  }

  const overdue = await listOverdueTrainingAssignmentsForLocation(params.locationId);
  const im = intervalMinutesForSchedule(run);
  const tickFireKey = buildFireTimeKey(run, params.timezone, im, params.tickAnchorMs);
  const cadence = params.reputationHr.trainingOverdueCadence ?? "once_per_episode";

  await appendEntityCadenceAlerts({
    out,
    locationId: params.locationId,
    storeLabel: params.storeLabel,
    settings: params.settings,
    cadence,
    alertKind: "training_overdue",
    entities: overdue.map((row) => ({ ...row, entityId: row._id })),
    entityKeyPrefix: "assignment",
    timezone: params.timezone,
    tickAnchorMs: params.tickAnchorMs,
    tickFireKey,
    buildPayload: (row, fireKey) => ({
      settings: params.settings,
      locationId: params.locationId,
      storeName: params.storeLabel,
      category: "reputation_hr",
      roleBindingSubcategory: "training_overdue",
      type: "alert_training_overdue",
      title: "Training overdue",
      message: `${params.storeLabel}: Training "${row.trainingName}" for ${row.assignTo} is overdue.`,
      alertKind: "training_overdue",
      severity: "critical",
      fireKey,
      data: {
        sourceKey: "training_overdue",
        count: 1,
        assignmentId: row._id,
        trainingName: row.trainingName,
        assignTo: row.assignTo,
      },
    }),
  });
}

async function appendPendingPipsPayloadsIfDue(
  out: ReputationHrAlertDispatchPayload[],
  params: {
    settings: IAlertNotificationSettings;
    reputationHr: IAlertNotificationSettings["reputationHr"];
    locationId: string;
    timezone: string;
    tickAnchorMs: number;
    storeLabel: string;
  },
): Promise<void> {
  if (!params.reputationHr.pendingPips) {
    return;
  }
  const run = params.reputationHr.pendingPipsRun;
  if (!shouldRunAlertScheduleTick(run, params.timezone, params.tickAnchorMs)) {
    return;
  }

  const pending = await listPendingPipIncidentsForLocation(params.locationId);
  const im = intervalMinutesForSchedule(run);
  const tickFireKey = buildFireTimeKey(run, params.timezone, im, params.tickAnchorMs);
  const cadence = params.reputationHr.pendingPipsCadence ?? "once_per_episode";

  await appendEntityCadenceAlerts({
    out,
    locationId: params.locationId,
    storeLabel: params.storeLabel,
    settings: params.settings,
    cadence,
    alertKind: "pip_pending",
    entities: pending.map((row) => ({ ...row, entityId: row.incidentId })),
    entityKeyPrefix: "incident",
    timezone: params.timezone,
    tickAnchorMs: params.tickAnchorMs,
    tickFireKey,
    buildPayload: (row, fireKey) => {
      const shortId = row.incidentId.slice(-6);
      return {
        settings: params.settings,
        locationId: params.locationId,
        storeName: params.storeLabel,
        category: "reputation_hr",
        roleBindingSubcategory: "pending_pips",
        type: "alert_pip_pending",
        title: "Pending PIPs",
        message: `${params.storeLabel}: Disciplinary document pending signature (incident #${shortId}).`,
        alertKind: "pip_pending",
        severity: "warning",
        fireKey,
        data: {
          sourceKey: "pip_pending",
          count: 1,
          incidentId: row.incidentId,
          signingStatus: row.signingStatus,
        },
      };
    },
  });
}

export async function collectReputationHrEvaluateAlertPayloads(params: {
  settings: IAlertNotificationSettings;
  locationId: string;
  timezone: string;
  tickAnchorMs: number;
  storeLabel: string;
}): Promise<ReputationHrAlertDispatchPayload[]> {
  const reputationHr = params.settings.reputationHr;
  const base = {
    settings: params.settings,
    locationId: params.locationId,
    timezone: params.timezone,
    tickAnchorMs: params.tickAnchorMs,
    storeLabel: params.storeLabel,
    reputationHr,
  };
  const out: ReputationHrAlertDispatchPayload[] = [];
  await appendTrainingOverduePayloadsIfDue(out, base);
  await appendPendingPipsPayloadsIfDue(out, base);
  return out;
}

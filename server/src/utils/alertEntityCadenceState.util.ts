import mongoose from "mongoose";
import {
  AlertEntityCadenceStateModel,
  type AlertEntityCadenceKind,
} from "../models/alertEntityCadenceState.model.js";
import type { AlertEntityCadenceStateSnapshot } from "./alertEntityCadence.util.js";
import type { AlertEntityCadenceSendPlan } from "./alertEntityCadence.util.js";

export type AlertEntityCadenceStateLean = AlertEntityCadenceStateSnapshot & {
  entityId: string;
};

export async function loadAlertEntityCadenceStateMap(
  locationId: string,
  alertKind: AlertEntityCadenceKind,
  entityIds: string[],
): Promise<Map<string, AlertEntityCadenceStateLean>> {
  if (entityIds.length === 0) {
    return new Map();
  }
  const locOid = new mongoose.Types.ObjectId(locationId);
  const docs = (await AlertEntityCadenceStateModel.find({
    locationId: locOid,
    alertKind,
    $or: [{ isActive: true }, { entityId: { $in: entityIds } }],
  })
    .lean()
    .exec()) as AlertEntityCadenceStateLean[];
  return new Map(docs.map((d) => [String(d.entityId), d]));
}

export async function resolveStaleAlertEntityCadenceStates(
  locationId: string,
  alertKind: AlertEntityCadenceKind,
  activeEntityIds: Set<string>,
): Promise<void> {
  const locOid = new mongoose.Types.ObjectId(locationId);
  const activeDocs = (await AlertEntityCadenceStateModel.find({
    locationId: locOid,
    alertKind,
    isActive: true,
  })
    .select("entityId")
    .lean()
    .exec()) as Array<{ entityId: string }>;

  const resolveOps: Array<Promise<unknown>> = [];
  for (const doc of activeDocs) {
    if (activeEntityIds.has(String(doc.entityId))) continue;
    resolveOps.push(
      AlertEntityCadenceStateModel.updateOne(
        { locationId: locOid, alertKind, entityId: String(doc.entityId) },
        { $set: { isActive: false, lastAlertedAt: null } },
      ).exec(),
    );
  }
  if (resolveOps.length > 0) {
    await Promise.all(resolveOps);
  }
}

export async function resetAllActiveAlertEntityCadenceStates(
  locationId: string,
  alertKind: AlertEntityCadenceKind,
): Promise<void> {
  const locOid = new mongoose.Types.ObjectId(locationId);
  await AlertEntityCadenceStateModel.updateMany(
    { locationId: locOid, alertKind, isActive: true },
    { $set: { isActive: false, lastAlertedAt: null } },
  ).exec();
}

/**
 * Build an upsert update that never sets `episodeStartedAt` in both `$set` and `$setOnInsert`
 * (MongoDB error code 40 if both are present).
 */
export function buildEpisodeCadenceUpsertUpdate(
  plan: AlertEntityCadenceSendPlan,
  tickAnchorMs: number,
  setFields: Record<string, unknown>,
): { $set: Record<string, unknown>; $setOnInsert?: Record<string, unknown> } {
  const $set: Record<string, unknown> = {
    ...setFields,
    ...(plan.nextLastAlertedAt ? { lastAlertedAt: plan.nextLastAlertedAt } : {}),
  };
  if (plan.nextEpisodeStartedAt) {
    $set.episodeStartedAt = plan.nextEpisodeStartedAt;
    return { $set };
  }
  return {
    $set,
    $setOnInsert: { episodeStartedAt: new Date(tickAnchorMs) },
  };
}

export async function persistAlertEntityCadenceEpisodeState(params: {
  locationId: string;
  alertKind: AlertEntityCadenceKind;
  entityId: string;
  tickAnchorMs: number;
  plan: AlertEntityCadenceSendPlan;
}): Promise<void> {
  const locOid = new mongoose.Types.ObjectId(params.locationId);
  await AlertEntityCadenceStateModel.updateOne(
    { locationId: locOid, alertKind: params.alertKind, entityId: params.entityId },
    buildEpisodeCadenceUpsertUpdate(params.plan, params.tickAnchorMs, { isActive: true }),
    { upsert: true },
  ).exec();
}

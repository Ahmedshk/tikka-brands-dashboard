import mongoose from "mongoose";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";
import { ValidationError } from "./errors.util.js";
import { logger } from "./logger.util.js";
import { runSyncForAllLocations } from "../services/integrationSyncRunner.service.js";
import { refreshRollupsAfterManualSyncSingleResource } from "../services/integrationPollRollupRefresh.service.js";

/** Manual sync only; periodic jobs call runSyncForAllLocations without these and use today / sliding windows. */
const RESOURCES_REQUIRING_DATE_RANGE = new Set<IntegrationSyncResource>([
  "homebase_timecards",
  "marketman_orders_both",
  "marketman_orders_sent",
  "marketman_orders_delivery",
]);

type ManualSyncBody = {
  resource: IntegrationSyncResource;
  locationIds?: string[];
  startDate?: string;
  endDate?: string;
};

function trimOptional(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildRunOpts(args: {
  startTrim: string;
  endTrim: string;
  locationIds?: string[];
}): { startDate?: string; endDate?: string; locationIds?: string[] } {
  const runOpts: { startDate?: string; endDate?: string; locationIds?: string[] } = {};
  if (args.startTrim) runOpts.startDate = args.startTrim;
  if (args.endTrim) runOpts.endDate = args.endTrim;
  if (args.locationIds?.length) runOpts.locationIds = args.locationIds;
  return runOpts;
}

function validateDateRangeRequired(args: {
  resource: IntegrationSyncResource;
  startTrim: string;
  endTrim: string;
}): void {
  if (RESOURCES_REQUIRING_DATE_RANGE.has(args.resource) && (!args.startTrim || !args.endTrim)) {
    throw new ValidationError("startDate and endDate are required for this resource.");
  }
}

export async function runManualIntegrationSync(args: {
  userId?: string;
  body: ManualSyncBody;
}): Promise<{
  ok: boolean;
  logId: string;
  totalUpserted: number;
  byLocation: Record<string, { upserted: number; errors: string[] }>;
}> {
  const { userId, body } = args;
  const { resource, locationIds } = body;
  const startTrim = trimOptional(body.startDate);
  const endTrim = trimOptional(body.endDate);

  validateDateRangeRequired({ resource, startTrim, endTrim });

  const logDoc: {
    triggeredByUserId?: mongoose.Types.ObjectId;
    resource: IntegrationSyncResource;
    locationIds: string[];
    startDate?: string;
    endDate?: string;
    status: "started";
  } = {
    resource,
    locationIds: locationIds ?? [],
    status: "started",
  };
  if (userId) logDoc.triggeredByUserId = new mongoose.Types.ObjectId(userId);
  if (startTrim) logDoc.startDate = startTrim;
  if (endTrim) logDoc.endDate = endTrim;

  const log = await IntegrationSyncLogModel.create(logDoc);
  const logId = log._id;

  const result = await runSyncForAllLocations(
    resource,
    buildRunOpts({
      startTrim,
      endTrim,
      ...(locationIds?.length ? { locationIds } : {}),
    }),
  );

  const anyErrors = Object.values(result.byLocation).some((c) => c.errors.length > 0);

  await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
    status: anyErrors ? "failed" : "success",
    message: anyErrors
      ? Object.entries(result.byLocation)
          .filter(([, v]) => v.errors.length)
          .map(([id, v]) => `${id}: ${v.errors.join("; ")}`)
          .join(" | ")
      : undefined,
    counts: {
      totalUpserted: result.totalUpserted,
      locations: Object.keys(result.byLocation).length,
    },
  }).exec();

  if (!anyErrors) {
    try {
      const rollupOpts: { startTrim: string; endTrim: string; locationIds?: string[] } = {
        startTrim,
        endTrim,
      };
      if (locationIds?.length) rollupOpts.locationIds = locationIds;
      await refreshRollupsAfterManualSyncSingleResource(resource, rollupOpts);
    } catch (err) {
      logger.error("runManualIntegrationSync: rollup refresh failed", { err, resource });
    }
  }

  return {
    ok: !anyErrors,
    logId: String(logId),
    totalUpserted: result.totalUpserted,
    byLocation: result.byLocation,
  };
}


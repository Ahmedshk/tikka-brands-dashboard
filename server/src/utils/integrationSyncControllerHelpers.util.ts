import mongoose from "mongoose";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";
import { ValidationError } from "./errors.util.js";
import { logger } from "./logger.util.js";
import { runSyncForAllLocations } from "../services/integrationSyncRunner.service.js";
import { refreshRollupsAfterManualSyncSingleResource } from "../services/integrationPollRollupRefresh.service.js";
import { updateSyncLogProgress } from "./integrationSyncProgress.util.js";

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

/**
 * Validates the request, inserts a started log, and returns the log id immediately.
 * The real work runs in the background via {@link runManualIntegrationSyncBackground}
 * so callers should treat the controller response as fire-and-forget.
 */
export async function startManualIntegrationSync(args: {
  userId?: string;
  body: ManualSyncBody;
}): Promise<{ logId: string }> {
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
  return { logId: String(log._id) };
}

/**
 * Runs the actual manual sync for an already-created log. Errors are persisted
 * to the log; this function never throws.
 */
export async function runManualIntegrationSyncBackground(args: {
  logId: string;
  body: ManualSyncBody;
}): Promise<void> {
  const { logId, body } = args;
  const { resource, locationIds } = body;
  const startTrim = trimOptional(body.startDate);
  const endTrim = trimOptional(body.endDate);

  try {
    const result = await runSyncForAllLocations(resource, {
      ...buildRunOpts({
        startTrim,
        endTrim,
        ...(locationIds?.length ? { locationIds } : {}),
      }),
      onProgress: (p) => updateSyncLogProgress(logId, p),
    });

    const anyErrors = Object.values(result.byLocation).some(
      (c) => c.errors.length > 0,
    );

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
        const rollupOpts: {
          startTrim: string;
          endTrim: string;
          locationIds?: string[];
        } = {
          startTrim,
          endTrim,
        };
        if (locationIds?.length) rollupOpts.locationIds = locationIds;
        await refreshRollupsAfterManualSyncSingleResource(resource, rollupOpts);
      } catch (err) {
        logger.error("runManualIntegrationSyncBackground: rollup refresh failed", {
          err,
          resource,
        });
      }
    }
  } catch (err) {
    logger.error("runManualIntegrationSyncBackground failed", {
      err,
      resource,
      logId,
    });
    try {
      await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      }).exec();
    } catch (updateErr) {
      logger.error(
        "runManualIntegrationSyncBackground: log status update failed",
        { err: updateErr, logId },
      );
    }
  }
}

import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  runSyncForAllLocations,
  runSyncAllResourcesForToday,
} from "../services/integrationSyncRunner.service.js";
import {
  refreshRollupsAfterManualSyncSingleResource,
  refreshDailyRollupsAfterRunAllToday,
} from "../services/integrationPollRollupRefresh.service.js";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";
import { ValidationError } from "../utils/errors.util.js";
import { logger } from "../utils/logger.util.js";

/** Manual sync only; periodic jobs call runSyncForAllLocations without these and use today / sliding windows. */
const RESOURCES_REQUIRING_DATE_RANGE: readonly IntegrationSyncResource[] = [
  "homebase_timecards",
  "marketman_orders_both",
  "marketman_orders_sent",
  "marketman_orders_delivery",
];

export const postIntegrationSync = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { resource, locationIds, startDate, endDate } = req.body as {
      resource: IntegrationSyncResource;
      locationIds?: string[];
      startDate?: string;
      endDate?: string;
    };

    const startTrim =
      typeof startDate === "string" ? startDate.trim() : "";
    const endTrim = typeof endDate === "string" ? endDate.trim() : "";

    if (
      RESOURCES_REQUIRING_DATE_RANGE.includes(resource) &&
      (!startTrim || !endTrim)
    ) {
      next(
        new ValidationError(
          "startDate and endDate are required for this resource.",
        ),
      );
      return;
    }

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
    if (userId) {
      logDoc.triggeredByUserId = new mongoose.Types.ObjectId(userId);
    }
    if (startTrim) {
      logDoc.startDate = startTrim;
    }
    if (endTrim) {
      logDoc.endDate = endTrim;
    }

    const log = await IntegrationSyncLogModel.create(logDoc);

    const runOpts: {
      startDate?: string;
      endDate?: string;
      locationIds?: string[];
    } = {};
    if (startTrim) runOpts.startDate = startTrim;
    if (endTrim) runOpts.endDate = endTrim;
    if (locationIds?.length) runOpts.locationIds = locationIds;

    const result = await runSyncForAllLocations(resource, runOpts);

    const anyErrors = Object.values(result.byLocation).some(
      (c) => c.errors.length > 0,
    );
    const logId = log._id as mongoose.Types.ObjectId;
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
        } = { startTrim, endTrim };
        if (locationIds?.length) rollupOpts.locationIds = locationIds;
        await refreshRollupsAfterManualSyncSingleResource(resource, rollupOpts);
      } catch (err) {
        logger.error("postIntegrationSync: rollup refresh failed", {
          err,
          resource,
        });
      }
    }

    res.json({
      ok: !anyErrors,
      logId: String(logId),
      totalUpserted: result.totalUpserted,
      byLocation: result.byLocation,
    });
  } catch (e) {
    next(e);
  }
};

export const postIntegrationSyncRunAllToday = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const logDoc: {
      triggeredByUserId?: mongoose.Types.ObjectId;
      resource: "all_resources_today";
      locationIds: string[];
      status: "started";
    } = {
      resource: "all_resources_today",
      locationIds: [],
      status: "started",
    };
    if (userId) {
      logDoc.triggeredByUserId = new mongoose.Types.ObjectId(userId);
    }
    const log = await IntegrationSyncLogModel.create(logDoc);
    const logId = log._id as mongoose.Types.ObjectId;

    try {
      const { steps, totalUpserted, allOk } = await runSyncAllResourcesForToday();
      try {
        await refreshDailyRollupsAfterRunAllToday();
      } catch (err) {
        logger.error("postIntegrationSyncRunAllToday: rollup refresh failed", {
          err,
        });
      }
      const failed = steps.filter((s) => !s.ok).map((s) => s.resource);
      await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
        status: allOk ? "success" : "failed",
        message:
          failed.length > 0 ? `Failed steps: ${failed.join(", ")}` : undefined,
        counts: {
          totalUpserted,
          steps: steps.length,
          failedSteps: failed.length,
        },
      }).exec();

      res.json({
        ok: allOk,
        logId: String(logId),
        totalUpserted,
        steps: steps.map((s) => ({
          resource: s.resource,
          totalUpserted: s.totalUpserted,
          ok: s.ok,
        })),
      });
    } catch (inner) {
      await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
        status: "failed",
        message:
          inner instanceof Error ? inner.message : String(inner),
      }).exec();
      throw inner;
    }
  } catch (e) {
    next(e);
  }
};

export const getIntegrationSyncLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const [total, logs] = await Promise.all([
      IntegrationSyncLogModel.countDocuments({}).exec(),
      IntegrationSyncLogModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ logs, total, page, limit });
  } catch (e) {
    next(e);
  }
};

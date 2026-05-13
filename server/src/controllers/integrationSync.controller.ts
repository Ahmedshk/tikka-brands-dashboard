import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  runSyncAllResourcesForToday,
} from "../services/integrationSyncRunner.service.js";
import {
  refreshDailyRollupsAfterRunAllToday,
} from "../services/integrationPollRollupRefresh.service.js";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";
import { logger } from "../utils/logger.util.js";
import { runManualIntegrationSync } from "../utils/integrationSyncControllerHelpers.util.js";

export const postIntegrationSync = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as {
      resource: IntegrationSyncResource;
      locationIds?: string[];
      startDate?: string;
      endDate?: string;
    };
    const payload = await runManualIntegrationSync({
      ...(req.user?.userId ? { userId: req.user.userId } : {}),
      body,
    });
    res.json(payload);
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
    const logId = log._id;

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
    } catch (error_) {
      await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
        status: "failed",
        message:
          error_ instanceof Error ? error_.message : String(error_),
      }).exec();
      throw error_;
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

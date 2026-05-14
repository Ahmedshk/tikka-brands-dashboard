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
import {
  startManualIntegrationSync,
  runManualIntegrationSyncBackground,
} from "../utils/integrationSyncControllerHelpers.util.js";
import { updateSyncLogProgress } from "../utils/integrationSyncProgress.util.js";
import { sweepStaleStartedLogs } from "../utils/integrationSyncStaleSweeper.util.js";

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
    const { logId } = await startManualIntegrationSync({
      ...(req.user?.userId ? { userId: req.user.userId } : {}),
      body,
    });

    setImmediate(() => {
      void runManualIntegrationSyncBackground({ logId, body });
    });

    res.status(202).json({ logId, started: true });
  } catch (e) {
    next(e);
  }
};

async function runAllTodayBackground(logId: string): Promise<void> {
  try {
    const { steps, totalUpserted, allOk } = await runSyncAllResourcesForToday({
      onProgress: (p) => updateSyncLogProgress(logId, p),
    });
    try {
      await refreshDailyRollupsAfterRunAllToday();
    } catch (err) {
      logger.error("runAllTodayBackground: rollup refresh failed", { err });
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
  } catch (err) {
    logger.error("runAllTodayBackground failed", { err, logId });
    try {
      await IntegrationSyncLogModel.findByIdAndUpdate(logId, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      }).exec();
    } catch (updateErr) {
      logger.error("runAllTodayBackground: log status update failed", {
        err: updateErr,
        logId,
      });
    }
  }
}

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
    const logId = String(log._id);

    setImmediate(() => {
      void runAllTodayBackground(logId);
    });

    res.status(202).json({ logId, started: true });
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
    await sweepStaleStartedLogs();
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

export const getIntegrationSyncActive = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await sweepStaleStartedLogs();
    const active = await IntegrationSyncLogModel.find({ status: "started" })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    res.json({ active });
  } catch (e) {
    next(e);
  }
};

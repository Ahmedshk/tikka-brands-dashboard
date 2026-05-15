import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { IntegrationSyncLogModel } from "../models/integrationSyncLog.model.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";
import { startManualIntegrationSync } from "../utils/integrationSyncControllerHelpers.util.js";
import { sweepStaleStartedLogs } from "../utils/integrationSyncStaleSweeper.util.js";
import { spawnIntegrationSyncWorker } from "../workers/spawnIntegrationSyncWorker.util.js";

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

    const result = spawnIntegrationSyncWorker({ kind: "manual", logId, body });
    if (!result.spawned) {
      res.status(429).json({
        logId,
        started: false,
        message: result.reason ?? "Too many concurrent syncs",
      });
      return;
    }

    res.status(202).json({ logId, started: true });
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
    const logId = String(log._id);

    const result = spawnIntegrationSyncWorker({ kind: "all-today", logId });
    if (!result.spawned) {
      res.status(429).json({
        logId,
        started: false,
        message: result.reason ?? "Too many concurrent syncs",
      });
      return;
    }

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

import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CommandCenterAlertDismissalModel } from "../models/commandCenterAlertDismissal.model.js";
import { LocationService } from "../services/location.service.js";
import {
  getAlertsBucketsForRequest,
  getAlertHistoryForRequest,
} from "../utils/commandCenterAlertsControllerHelpers.util.js";

const locationService = new LocationService();

export async function getCommandCenterAlerts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAlertsBucketsForRequest({ req, locationService });
    if (result.kind === "bad_request") {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    if (result.kind === "not_found") {
      res.status(404).json({ success: false, message: result.message });
      return;
    }

    res.json({ success: true, data: { alerts: result.buckets } });
  } catch (err) {
    next(err);
  }
}

export async function getCommandCenterAlertHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAlertHistoryForRequest({ req, locationService });
    if (result.kind === "bad_request") {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    if (result.kind === "not_found") {
      res.status(404).json({ success: false, message: result.message });
      return;
    }
    if (result.kind === "forbidden") {
      res.status(403).json({ success: false, message: result.message });
      return;
    }

    res.json({ success: true, data: { alerts: result.alerts } });
  } catch (err) {
    next(err);
  }
}

export async function dismissCommandCenterAlerts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const ids = (req.body as { notificationIds?: string[] }).notificationIds ?? [];
    const oidUser = new mongoose.Types.ObjectId(userId);

    const ops = ids
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((notificationId) =>
        CommandCenterAlertDismissalModel.updateOne(
          { userId: oidUser, notificationId: new mongoose.Types.ObjectId(notificationId) },
          {
            $setOnInsert: {
              userId: oidUser,
              notificationId: new mongoose.Types.ObjectId(notificationId),
            },
          },
          { upsert: true },
        ),
      );

    await Promise.all(ops);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

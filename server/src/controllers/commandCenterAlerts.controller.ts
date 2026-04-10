import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CommandCenterAlertDismissalModel } from "../models/commandCenterAlertDismissal.model.js";
import { LocationService } from "../services/location.service.js";
import { getTodayInTimezone } from "../utils/timezone.util.js";
import { getEffectivePagePermission } from "../utils/permissions.util.js";
import { PAGE_COMPONENT_IDS } from "../config/kpi-metrics.config.js";
import {
  collectCommandCenterAlertsForUser,
  type CommandCenterAlertCategory,
  type CommandCenterCardRow,
} from "../utils/commandCenterAlertsCollect.util.js";

const locationService = new LocationService();

type AlertsAccessFlags = {
  canFinancial: boolean;
  canInventory: boolean;
  canReputation: boolean;
};

function componentPermissionsFromRequest(req: Request): AlertsAccessFlags {
  const effectivePage = getEffectivePagePermission(
    req.user!.permissions!,
    req.user!.permissionRemovals ?? null,
    "command-center",
    PAGE_COMPONENT_IDS["command-center"] ?? [],
    "Command Center",
    req.user!.permissionOverrides ?? null,
  );
  const components = effectivePage?.components;
  return {
    canFinancial:
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-financial-labor"),
    canInventory:
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-inventory-supply-chain"),
    canReputation:
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-reputation-hr"),
  };
}

function canAccessCategory(
  category: CommandCenterAlertCategory,
  flags: AlertsAccessFlags,
): boolean {
  switch (category) {
    case "financial_labor":
      return flags.canFinancial;
    case "inventory_supply_chain":
      return flags.canInventory;
    case "reputation_hr":
      return flags.canReputation;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

async function loadDismissedNotificationIds(userId: string): Promise<Set<string>> {
  const oidUser = new mongoose.Types.ObjectId(userId);
  const dismissals = await CommandCenterAlertDismissalModel.find({ userId: oidUser })
    .select("notificationId")
    .lean();
  return new Set(dismissals.map((d) => String(d.notificationId)));
}

export async function getCommandCenterAlerts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId.trim() : "";
    if (!locationId) {
      res.status(400).json({ success: false, message: "locationId is required" });
      return;
    }

    const location = await locationService.getById(locationId);
    if (!location) {
      res.status(404).json({ success: false, message: "Location not found" });
      return;
    }
    const timezone = location.timezone?.trim() || "America/Denver";
    const todayKey = getTodayInTimezone(timezone);

    const { canFinancial, canInventory, canReputation } = componentPermissionsFromRequest(req);
    const userId = req.user!.userId;
    const dismissed = await loadDismissedNotificationIds(userId);

    const collected = await collectCommandCenterAlertsForUser({
      userId,
      locationId,
      timezone,
      todayKey,
      dismissed,
      canFinancial,
      canInventory,
      canReputation,
    });

    const buckets: {
      financial_labor: CommandCenterCardRow[];
      inventory_supply_chain: CommandCenterCardRow[];
      reputation_hr: CommandCenterCardRow[];
    } = {
      financial_labor: [],
      inventory_supply_chain: [],
      reputation_hr: [],
    };

    for (const item of collected) {
      if (item.createdKey !== todayKey) continue;
      buckets[item.category].push(item.row);
    }

    res.json({ success: true, data: { alerts: buckets } });
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
    const locationId =
      typeof req.query.locationId === "string" ? req.query.locationId.trim() : "";
    const categoryRaw = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const category = categoryRaw as CommandCenterAlertCategory;

    const location = await locationService.getById(locationId);
    if (!location) {
      res.status(404).json({ success: false, message: "Location not found" });
      return;
    }
    const timezone = location.timezone?.trim() || "America/Denver";
    const todayKey = getTodayInTimezone(timezone);

    const flags = componentPermissionsFromRequest(req);
    if (!canAccessCategory(category, flags)) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }

    const userId = req.user!.userId;
    const dismissed = await loadDismissedNotificationIds(userId);

    const collected = await collectCommandCenterAlertsForUser({
      userId,
      locationId,
      timezone,
      todayKey,
      dismissed,
      canFinancial: flags.canFinancial,
      canInventory: flags.canInventory,
      canReputation: flags.canReputation,
    });

    const alerts: CommandCenterCardRow[] = [];
    for (const item of collected) {
      if (item.category !== category) continue;
      if (item.createdKey === todayKey) continue;
      alerts.push(item.row);
    }

    res.json({ success: true, data: { alerts } });
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

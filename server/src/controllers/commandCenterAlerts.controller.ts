import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { NotificationModel } from "../models/notification.model.js";
import { CommandCenterAlertDismissalModel } from "../models/commandCenterAlertDismissal.model.js";
import { LocationService } from "../services/location.service.js";
import {
  COMMAND_CENTER_ALERT_TYPES,
  COMMAND_CENTER_REPUTATION_REVIEW_TYPES,
  notificationTypeToCommandCenterCategory,
  severityFromNotification,
} from "../utils/commandCenterAlertTypes.util.js";
import { getTodayInTimezone } from "../utils/timezone.util.js";
import { getEffectivePagePermission } from "../utils/permissions.util.js";
import { PAGE_COMPONENT_IDS } from "../config/kpi-metrics.config.js";
import type { NotificationType } from "../types/notification.types.js";

const locationService = new LocationService();

const ALL_CARD_TYPES: NotificationType[] = [
  ...Array.from(COMMAND_CENTER_ALERT_TYPES),
  ...Array.from(COMMAND_CENTER_REPUTATION_REVIEW_TYPES),
] as NotificationType[];

function createdAtToLocalDateKey(iso: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(iso);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
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

    const effectivePage = getEffectivePagePermission(
      req.user!.permissions!,
      req.user!.permissionRemovals ?? null,
      "command-center",
      PAGE_COMPONENT_IDS["command-center"] ?? [],
      "Command Center",
      req.user!.permissionOverrides ?? null,
    );
    const components = effectivePage?.components;
    const canFinancial =
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-financial-labor");
    const canInventory =
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-inventory-supply-chain");
    const canReputation =
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-reputation-hr");

    const userId = req.user!.userId;
    const oidUser = new mongoose.Types.ObjectId(userId);
    const dismissals = await CommandCenterAlertDismissalModel.find({ userId: oidUser })
      .select("notificationId")
      .lean();
    const dismissed = new Set(
      dismissals.map((d) => String(d.notificationId)),
    );

    const notifications = await NotificationModel.find({
      recipientId: userId,
      type: { $in: ALL_CARD_TYPES },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    type CardRow = {
      id: string;
      type: string;
      title: string;
      message: string;
      severity: "warning" | "critical";
      createdAt: string;
      dismissable: boolean;
    };

    const buckets: {
      financial_labor: CardRow[];
      inventory_supply_chain: CardRow[];
      reputation_hr: CardRow[];
    } = {
      financial_labor: [],
      inventory_supply_chain: [],
      reputation_hr: [],
    };

    for (const n of notifications) {
      const id = String(n._id);
      if (dismissed.has(id)) continue;

      const data = n.data as Record<string, unknown> | undefined;
      const locInData = data?.locationId != null ? String(data.locationId) : null;
      if (locInData != null && locInData !== locationId) continue;

      const cat = notificationTypeToCommandCenterCategory(
        n.type,
        data,
      );
      if (!cat) continue;
      if (cat === "financial_labor" && !canFinancial) continue;
      if (cat === "inventory_supply_chain" && !canInventory) continue;
      if (cat === "reputation_hr" && !canReputation) continue;

      const created = n.createdAt ? new Date(n.createdAt) : new Date();
      const createdKey = createdAtToLocalDateKey(created, timezone);
      const dismissable = createdKey < todayKey;

      const row: CardRow = {
        id,
        type: n.type,
        title: n.title,
        message: n.message,
        severity: severityFromNotification(n.type, data),
        createdAt: created.toISOString(),
        dismissable,
      };

      buckets[cat].push(row);
    }

    res.json({ success: true, data: { alerts: buckets } });
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
          { $setOnInsert: { userId: oidUser, notificationId: new mongoose.Types.ObjectId(notificationId) } },
          { upsert: true },
        ),
      );

    await Promise.all(ops);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

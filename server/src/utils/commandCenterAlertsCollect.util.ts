import { NotificationModel } from "../models/notification.model.js";
import {
  COMMAND_CENTER_ALERT_TYPES,
  COMMAND_CENTER_REPUTATION_REVIEW_TYPES,
  notificationTypeToCommandCenterCategory,
  severityFromNotification,
} from "./commandCenterAlertTypes.util.js";
import type { NotificationType } from "../types/notification.types.js";

const ALL_CARD_TYPES: NotificationType[] = [
  ...COMMAND_CENTER_ALERT_TYPES,
  ...COMMAND_CENTER_REPUTATION_REVIEW_TYPES,
];

export type CommandCenterCardRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "warning" | "critical";
  createdAt: string;
  dismissable: boolean;
};

export type CommandCenterAlertCategory =
  | "financial_labor"
  | "inventory_supply_chain"
  | "reputation_hr";

export type CollectedCommandCenterAlert = {
  row: CommandCenterCardRow;
  category: CommandCenterAlertCategory;
  createdKey: string;
};

export function createdAtToLocalDateKeyForLocation(iso: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(iso);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
}

export async function collectCommandCenterAlertsForUser(params: {
  userId: string;
  locationId: string;
  timezone: string;
  todayKey: string;
  dismissed: Set<string>;
  canFinancial: boolean;
  canInventory: boolean;
  canReputation: boolean;
}): Promise<CollectedCommandCenterAlert[]> {
  const {
    userId,
    locationId,
    timezone,
    todayKey,
    dismissed,
    canFinancial,
    canInventory,
    canReputation,
  } = params;

  const notifications = await NotificationModel.find({
    recipientId: userId,
    type: { $in: ALL_CARD_TYPES },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const out: CollectedCommandCenterAlert[] = [];

  for (const n of notifications) {
    const id = String(n._id);
    if (dismissed.has(id)) continue;

    const data = n.data as Record<string, unknown> | undefined;
    const locInData = data?.locationId != null ? String(data.locationId) : null;
    if (locInData != null && locInData !== locationId) continue;

    const cat = notificationTypeToCommandCenterCategory(n.type, data);
    if (!cat) continue;
    if (cat === "financial_labor" && !canFinancial) continue;
    if (cat === "inventory_supply_chain" && !canInventory) continue;
    if (cat === "reputation_hr" && !canReputation) continue;

    const created = n.createdAt ? new Date(n.createdAt) : new Date();
    const createdKey = createdAtToLocalDateKeyForLocation(created, timezone);
    const dismissable = createdKey < todayKey;

    const row: CommandCenterCardRow = {
      id,
      type: n.type,
      title: n.title,
      message: n.message,
      severity: severityFromNotification(n.type, data),
      createdAt: created.toISOString(),
      dismissable,
    };

    out.push({ row, category: cat, createdKey });
  }

  return out;
}

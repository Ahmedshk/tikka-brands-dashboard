import {
  NotificationModel,
  type NotificationDocument,
} from "../models/notification.model.js";
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

type NotificationLeanForCommandCenter = Pick<
  NotificationDocument,
  "_id" | "type" | "title" | "message" | "data" | "createdAt"
>;

function locationIdFromObject(value: object): string | null {
  const nested = (value as { _id?: unknown })._id;
  if (nested != null && nested !== value) {
    return locationIdFromNotificationData(nested);
  }
  if (typeof (value as { toString?: () => unknown }).toString === "function") {
    const s = (value as { toString: () => unknown }).toString();
    if (typeof s === "string" && s.length > 0 && !s.startsWith("[object ")) {
      return s;
    }
  }
  return null;
}

/** Coerce `data.locationId` for comparison; avoids `String` on arbitrary objects. */
function locationIdFromNotificationData(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return locationIdFromObject(value);
  return null;
}

function notificationMatchesLocation(
  data: Record<string, unknown> | undefined,
  locationId: string,
): boolean {
  const locInData = locationIdFromNotificationData(data?.locationId);
  if (locInData == null) return true;
  return locInData === locationId;
}

function userHasCategoryPermission(
  cat: CommandCenterAlertCategory,
  flags: {
    canFinancial: boolean;
    canInventory: boolean;
    canReputation: boolean;
  },
): boolean {
  switch (cat) {
    case "financial_labor":
      return flags.canFinancial;
    case "inventory_supply_chain":
      return flags.canInventory;
    case "reputation_hr":
      return flags.canReputation;
    default: {
      const _exhaustive: never = cat;
      return _exhaustive;
    }
  }
}

function mapNotificationToCollectedCommandCenterAlert(
  n: NotificationLeanForCommandCenter,
  ctx: {
    locationId: string;
    timezone: string;
    todayKey: string;
    dismissed: Set<string>;
    canFinancial: boolean;
    canInventory: boolean;
    canReputation: boolean;
  },
): CollectedCommandCenterAlert | null {
  const id = String(n._id);
  if (ctx.dismissed.has(id)) return null;

  const data = n.data;
  if (!notificationMatchesLocation(data, ctx.locationId)) return null;

  const cat = notificationTypeToCommandCenterCategory(n.type, data);
  if (!cat) return null;
  if (
    !userHasCategoryPermission(cat, {
      canFinancial: ctx.canFinancial,
      canInventory: ctx.canInventory,
      canReputation: ctx.canReputation,
    })
  ) {
    return null;
  }

  const created = n.createdAt ? new Date(n.createdAt) : new Date();
  const createdKey = createdAtToLocalDateKeyForLocation(created, ctx.timezone);
  const dismissable = createdKey < ctx.todayKey;

  const row: CommandCenterCardRow = {
    id,
    type: n.type,
    title: n.title,
    message: n.message,
    severity: severityFromNotification(n.type, data),
    createdAt: created.toISOString(),
    dismissable,
  };

  return { row, category: cat, createdKey };
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

  const ctx = {
    locationId,
    timezone,
    todayKey,
    dismissed,
    canFinancial,
    canInventory,
    canReputation,
  };

  const out: CollectedCommandCenterAlert[] = [];
  for (const n of notifications) {
    const collected = mapNotificationToCollectedCommandCenterAlert(
      n as NotificationLeanForCommandCenter,
      ctx,
    );
    if (collected) out.push(collected);
  }

  return out;
}

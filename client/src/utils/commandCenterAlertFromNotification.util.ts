import type { AlertRoleBindingCategory, CommandCenterAlertRow } from "../types/alertNotification.types";

const COMMAND_CENTER_ALERT_TYPES: ReadonlySet<string> = new Set([
  "alert_goal_sales_warning",
  "alert_goal_sales_critical",
  "alert_goal_labor_pct_warning",
  "alert_goal_labor_pct_critical",
  "alert_goal_hours_warning",
  "alert_goal_hours_critical",
  "alert_goal_spmh_warning",
  "alert_goal_spmh_critical",
  "alert_goal_food_cost_warning",
  "alert_goal_food_cost_critical",
  "alert_inventory_delivery_overdue",
  "alert_inventory_low_inventory",
  "alert_training_overdue",
  "alert_pip_pending",
  "alert_low_rating_review",
]);

const COMMAND_CENTER_REPUTATION_REVIEW_TYPES: ReadonlySet<string> = new Set([
  "review_self_past_due",
  "review_manager_past_due",
  "review_director_past_due",
  "review_sharing_past_due",
  "review_checkin_past_due",
]);

export function notificationTypeToCommandCenterCategory(
  type: string,
  data: Record<string, unknown> | undefined,
): AlertRoleBindingCategory | null {
  const fromData = data?.category;
  if (
    fromData === "financial_labor" ||
    fromData === "inventory_supply_chain" ||
    fromData === "reputation_hr"
  ) {
    return fromData;
  }
  if (COMMAND_CENTER_ALERT_TYPES.has(type)) {
    if (type === "alert_inventory_delivery_overdue") return "inventory_supply_chain";
    if (type === "alert_inventory_low_inventory") return "inventory_supply_chain";
    if (
      type === "alert_training_overdue" ||
      type === "alert_pip_pending" ||
      type === "alert_low_rating_review"
    ) {
      return "reputation_hr";
    }
    if (type.startsWith("alert_goal_")) return "financial_labor";
  }
  if (COMMAND_CENTER_REPUTATION_REVIEW_TYPES.has(type)) {
    return "reputation_hr";
  }
  return null;
}

export function severityFromNotification(
  type: string,
  data: Record<string, unknown> | undefined,
): "warning" | "critical" {
  const d = data?.severity;
  if (d === "warning" || d === "critical") return d;
  if (type.includes("_critical")) return "critical";
  if (type.includes("_warning")) return "warning";
  if (type.endsWith("_past_due")) return "critical";
  return "warning";
}

/** YYYY-MM-DD for the notification's created instant in the location timezone (matches server). */
export function notificationCreatedDateKeyInTimezone(iso: string | Date, timezone: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
}

export type NotificationNewPayload = {
  _id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  createdAt?: string | Date;
};

export function tryCommandCenterRowFromNotificationNew(
  payload: NotificationNewPayload,
  ctx: {
    locationId: string;
    timezone: string;
    todayKey: string;
    dismissedIds: ReadonlySet<string>;
    canFinancial: boolean;
    canInventory: boolean;
    canReputation: boolean;
  },
): { row: CommandCenterAlertRow; category: AlertRoleBindingCategory } | null {
  const locationIdFromData = (data: Record<string, unknown> | undefined): string | null => {
    if (!data) return null;
    const raw = data.locationId;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    return null;
  };

  const id = String(payload._id);
  if (ctx.dismissedIds.has(id)) return null;

  const data = payload.data ?? undefined;
  const locInData = locationIdFromData(data);
  if (locInData !== null && locInData !== ctx.locationId) return null;

  const cat = notificationTypeToCommandCenterCategory(String(payload.type), data);
  if (!cat) return null;
  if (cat === "financial_labor" && !ctx.canFinancial) return null;
  if (cat === "inventory_supply_chain" && !ctx.canInventory) return null;
  if (cat === "reputation_hr" && !ctx.canReputation) return null;

  const createdRaw = payload.createdAt ?? new Date();
  const created = createdRaw instanceof Date ? createdRaw : new Date(createdRaw);
  const createdKey = notificationCreatedDateKeyInTimezone(created, ctx.timezone);
  if (createdKey !== ctx.todayKey) return null;

  const dismissable = createdKey < ctx.todayKey;

  return {
    category: cat,
    row: {
      id,
      type: String(payload.type),
      title: payload.title,
      message: payload.message,
      severity: severityFromNotification(String(payload.type), data),
      createdAt: created.toISOString(),
      dismissable,
    },
  };
}

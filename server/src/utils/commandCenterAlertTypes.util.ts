import type { NotificationType } from "../types/notification.types.js";

export const COMMAND_CENTER_ALERT_TYPES: ReadonlySet<NotificationType> = new Set([
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

/** Review / check-in notifications shown under Reputation & HR on Command Center. */
export const COMMAND_CENTER_REPUTATION_REVIEW_TYPES: ReadonlySet<NotificationType> = new Set([
  "review_self_past_due",
  "review_manager_past_due",
  "review_director_past_due",
  "review_sharing_past_due",
  "review_checkin_past_due",
]);

export function notificationTypeToCommandCenterCategory(
  type: string,
  data: Record<string, unknown> | undefined,
): "financial_labor" | "inventory_supply_chain" | "reputation_hr" | null {
  const fromData = data?.category;
  if (
    fromData === "financial_labor" ||
    fromData === "inventory_supply_chain" ||
    fromData === "reputation_hr"
  ) {
    return fromData;
  }
  if (COMMAND_CENTER_ALERT_TYPES.has(type as NotificationType)) {
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
  if (COMMAND_CENTER_REPUTATION_REVIEW_TYPES.has(type as NotificationType)) {
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

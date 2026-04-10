import type {
  AlertRoleBindingCategory,
  IAlertRoleBinding,
} from "../types/alertNotification.types.js";

/** Subcategory keys stored on role bindings (aligns with financial metric keys and alert sources). */
export const ALERT_ROLE_SUBCATEGORIES: Record<AlertRoleBindingCategory, readonly string[]> = {
  financial_labor: ["sales", "laborCostPct", "hours", "spmh", "foodCostPct"],
  inventory_supply_chain: ["delivery_overdue"],
  reputation_hr: ["training_overdue", "pending_pips"],
} as const;

export function isValidRoleBindingSubcategory(
  category: AlertRoleBindingCategory,
  subcategory: string | undefined,
): boolean {
  if (subcategory == null || subcategory === "") return true;
  const list = ALERT_ROLE_SUBCATEGORIES[category];
  return (list as readonly string[]).includes(subcategory);
}

/** Legacy bindings omit `subcategory` and apply to every alert in the category. */
export function roleBindingMatchesSubcategory(
  binding: Pick<IAlertRoleBinding, "subcategory">,
  alertSubcategory: string,
): boolean {
  if (binding.subcategory == null || binding.subcategory === "") return true;
  return binding.subcategory === alertSubcategory;
}

import type { AlertRoleBindingCategory } from "../types/alertNotification.types";
import type { DropdownOption } from "../components/common/Dropdown";

/** Subcategory keys per category (must match server `ALERT_ROLE_SUBCATEGORIES`). */
export const NOTIFY_ROLES_SUBCATEGORIES: Record<AlertRoleBindingCategory, readonly string[]> = {
  financial_labor: ["sales", "laborCostPct", "hours", "spmh", "foodCostPct"],
  inventory_supply_chain: ["delivery_overdue", "low_inventory"],
  reputation_hr: ["training_overdue", "pending_pips", "low_rating_reviews"],
};

export const NOTIFY_ROLES_SUBCATEGORY_LABELS: Record<string, string> = {
  sales: "Sales goal",
  laborCostPct: "Labor cost %",
  hours: "Hours goal",
  spmh: "SPMH goal",
  foodCostPct: "Food cost %",
  delivery_overdue: "Delivery overdue (not received)",
  low_inventory: "Low inventory (below minimum on hand)",
  training_overdue: "Training overdue",
  pending_pips: "Pending PIPs",
  low_rating_reviews: "Low Google review rating",
};

export function firstSubcategoryForNotifyRoles(category: AlertRoleBindingCategory): string {
  return NOTIFY_ROLES_SUBCATEGORIES[category][0] ?? "";
}

export function subcategoryOptionsForNotifyRoles(category: AlertRoleBindingCategory): DropdownOption[] {
  return NOTIFY_ROLES_SUBCATEGORIES[category].map((value) => ({
    value,
    label: NOTIFY_ROLES_SUBCATEGORY_LABELS[value] ?? value,
  }));
}

/** Sort order for rule rows: explicit subs in category order, then legacy (no subcategory) last. */
export function compareNotifyRoleRows(
  a: { category: AlertRoleBindingCategory; subKey: string },
  b: { category: AlertRoleBindingCategory; subKey: string },
  categoryOrder: readonly AlertRoleBindingCategory[],
): number {
  const ci = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  if (ci !== 0) return ci;
  const rank = (cat: AlertRoleBindingCategory, subKey: string) => {
    if (subKey === "") return 1000;
    const i = NOTIFY_ROLES_SUBCATEGORIES[cat].indexOf(subKey);
    return i >= 0 ? i : 999;
  };
  return rank(a.category, a.subKey) - rank(b.category, b.subKey);
}

export function bindingSubKey(subcategory: string | undefined): string {
  return subcategory?.trim() ? subcategory.trim() : "";
}

export function notifyRolesRowLabel(categoryLabel: string, subKey: string): string {
  if (subKey === "") return `${categoryLabel} · All alert types (legacy)`;
  const sub = NOTIFY_ROLES_SUBCATEGORY_LABELS[subKey] ?? subKey;
  return `${categoryLabel} · ${sub}`;
}

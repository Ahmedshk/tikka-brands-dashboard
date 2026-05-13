import type { AlertNotificationSettingsDto, AlertRoleBindingCategory } from "../types/alertNotification.types";

export function getRoleNamesForBindingRow(params: {
  roleBindings: AlertNotificationSettingsDto["roleBindings"];
  roles: Array<{ _id: string; name: string }>;
  category: AlertRoleBindingCategory;
  subKey: string;
  bindingSubKey: (subcategory: string | undefined) => string;
}): string {
  const { roleBindings, roles, category, subKey, bindingSubKey } = params;

  const roleIdToName = new Map(roles.map((r) => [r._id, r.name] as const));
  return roleBindings
    .filter((b) => b.category === category && bindingSubKey(b.subcategory) === subKey)
    .map((b) => roleIdToName.get(b.roleId) ?? "Role")
    .join(", ");
}


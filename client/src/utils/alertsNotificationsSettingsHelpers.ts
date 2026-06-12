import type {
  AlertEntityCadenceDto,
  AlertNotificationSettingsDto,
  AlertRoleBindingCategory,
} from "../types/alertNotification.types";
import type { DropdownOption } from "../components/common/Dropdown";

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

export function normalizeAlertEntityCadence(value: unknown): AlertEntityCadenceDto {
  if (value === "every_run" || value === "once_per_day" || value === "once_per_episode") {
    return value;
  }
  return "once_per_episode";
}

export function alertEntityCadenceOptions(episodeLabel: string): DropdownOption[] {
  return [
    { value: "every_run", label: "Every time the check runs" },
    { value: "once_per_day", label: "Once per day" },
    { value: "once_per_episode", label: episodeLabel },
  ];
}

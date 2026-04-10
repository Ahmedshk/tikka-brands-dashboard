import type { AlertItem } from "../components/CommandCenter/AlertsCard";
import type { CommandCenterAlertRow } from "../types/alertNotification.types";

export function commandCenterAlertRowToAlertItem(row: CommandCenterAlertRow): AlertItem {
  const bodyLine = row.message.trim();
  return {
    id: row.id,
    titleLine: row.title,
    bodyLine: bodyLine.length > 0 ? bodyLine : undefined,
    subtitle: new Date(row.createdAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    severity: row.severity,
    dismissable: row.dismissable,
    createdAt: row.createdAt,
  };
}

import type { AlertItem } from "../components/CommandCenter/AlertsCard";
import type { CommandCenterAlertRow } from "../types/alertNotification.types";

export function commandCenterAlertRowToAlertItem(
  row: CommandCenterAlertRow,
  options?: { includeLocationLine?: boolean },
): AlertItem {
  const raw = row.message.trim();
  const prefixMatch = /^(.+?):\s+(.+)$/.exec(raw);
  const locationLine = prefixMatch?.[1]?.trim();
  const bodyLine = (prefixMatch?.[2] ?? raw).trim();
  const includeLocationLine = options?.includeLocationLine ?? false;
  return {
    id: row.id,
    alertType: row.type,
    locationLine:
      includeLocationLine && locationLine && locationLine.toLowerCase() !== "location"
        ? locationLine
        : undefined,
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

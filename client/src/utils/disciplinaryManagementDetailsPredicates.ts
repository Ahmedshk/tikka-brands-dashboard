import type { IncidentHistoryItem } from "../types/disciplinaryManagement.types";

export function canManagerSignIncident(item: IncidentHistoryItem, currentUserId: string | null): boolean {
  return item.signingPhase === "pending_manager" && currentUserId != null && item.assignerId === currentUserId;
}


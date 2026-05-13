import { useEffect } from "react";
import type { NotificationItem } from "../services/notification.service";

export function useDisciplinaryRealtimeNotificationRefresh(params: {
  employeeId: string | undefined;
  notifications: NotificationItem[];
  lastHandledNotificationIdRef: { current: string | null };
  refreshDetailsSilently: () => Promise<void>;
}) {
  const { employeeId, notifications, lastHandledNotificationIdRef, refreshDetailsSilently } = params;

  useEffect(() => {
    if (employeeId == null || notifications.length === 0) return;
    const latest: NotificationItem | undefined = notifications[0];
    if (!latest || latest._id === lastHandledNotificationIdRef.current) return;
    lastHandledNotificationIdRef.current = latest._id;

    const data = latest.data ?? {};
    const notificationEmployeeId = typeof data.employeeId === "string" ? data.employeeId : null;
    if (notificationEmployeeId !== employeeId) return;

    const realtimeTypes = new Set([
      "disciplinary_manager_signed",
      "disciplinary_document_signed",
      "disciplinary_signing_aborted",
    ]);
    if (!realtimeTypes.has(latest.type)) return;

    void refreshDetailsSilently();
  }, [employeeId, notifications, refreshDetailsSilently, lastHandledNotificationIdRef]);
}


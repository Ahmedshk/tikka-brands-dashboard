import { createElement, type ReactElement } from "react";
import toast from "react-hot-toast";
import NotificationIcon from "@assets/icons/notification.svg?react";
import type { NotificationItem } from "../services/notification.service";

const TOAST_DURATION_MS = 5000;

function notificationToastBody(title: string, message: string): ReactElement {
  const textBlock = createElement(
    "div",
    { className: "flex min-w-0 flex-1 flex-col gap-1 text-left" },
    title
      ? createElement("span", { className: "font-semibold text-sm" }, title)
      : null,
    message
      ? createElement(
          "span",
          { className: "text-xs text-gray-600 line-clamp-4 whitespace-pre-wrap" },
          message,
        )
      : null,
  );

  return createElement(
    "div",
    {
      className:
        "flex max-w-[min(100%,320px)] items-start gap-3 text-left",
    },
    createElement(NotificationIcon, {
      className: "h-6 w-6 shrink-0",
      "aria-hidden": true,
    }),
    textBlock,
  );
}

/**
 * Shows a toast for a real-time notification payload (same shape as `NotificationItem` from the API).
 */
export function showInAppNotificationToast(payload: unknown): void {
  const n = payload as Partial<NotificationItem>;
  const title = typeof n.title === "string" ? n.title.trim() : "";
  const message = typeof n.message === "string" ? n.message.trim() : "";
  if (!title && !message) return;

  toast(() => notificationToastBody(title, message), { duration: TOAST_DURATION_MS });
}

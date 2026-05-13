import { NotificationModel, type NotificationDocument } from "../models/notification.model.js";
import { getIO } from "../config/socket.js";
import { logger } from "./logger.util.js";
import type {
  NotificationChannel,
  SendNotificationOptions,
} from "../types/notification.types.js";
import { locationLabelFromNotificationData } from "./notificationLocationData.util.js";

export function deriveNotificationDeliverChannels(channels: NotificationChannel[]): {
  shouldInApp: boolean;
  shouldEmail: boolean;
  shouldSms: boolean;
} {
  return {
    shouldInApp: channels.includes("in_app") || channels.includes("all"),
    shouldEmail: channels.includes("email") || channels.includes("all"),
    shouldSms: channels.includes("sms") || channels.includes("all"),
  };
}

function escapeHtmlForEmail(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Appends a Location line for SMS/plain text when the body does not already mention the store. */
function appendLocationToPlainText(body: string, locationLabel: string): string {
  const loc = locationLabel.trim();
  if (!loc) return body;
  if (body.toLowerCase().includes(loc.toLowerCase())) return body;
  return `${body.trimEnd()}\n\nLocation: ${loc}`;
}

function mergeLocationIntoEmailTemplateData(
  templateData: Record<string, unknown>,
  resolvedLocationLabel: string | undefined,
): void {
  if (!resolvedLocationLabel) return;
  const locLine = templateData.locationLine;
  const locName = templateData.locationName;
  const hasExisting =
    (typeof locLine === "string" && locLine.trim() !== "") ||
    (typeof locName === "string" && locName.trim() !== "");
  if (!hasExisting) {
    templateData.locationName = resolvedLocationLabel;
  }
}

function buildFallbackNotificationEmailHtml(
  message: string,
  resolvedLocationLabel: string | undefined,
  actionUrl: string | undefined,
): string {
  let body = `<p>${escapeHtmlForEmail(message)}</p>`;
  if (resolvedLocationLabel) {
    body += `<p style="margin-top:12px"><strong>Location:</strong> ${escapeHtmlForEmail(resolvedLocationLabel)}</p>`;
  }
  if (actionUrl) {
    body += `<p><a href="${actionUrl}">Click here</a></p>`;
  }
  return body;
}

export async function deliverNotificationInApp(params: {
  recipientId: string;
  type: SendNotificationOptions["type"];
  title: string;
  messageForInApp: string;
  data: Record<string, unknown> | undefined;
}): Promise<boolean> {
  const { recipientId, type, title, messageForInApp, data } = params;
  try {
    const createPayload: {
      recipientId: string;
      type: typeof type;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    } = {
      recipientId,
      type,
      title,
      message: messageForInApp,
    };
    if (data !== undefined) createPayload.data = data;
    const notification = (await NotificationModel.create(createPayload)) as NotificationDocument;

    try {
      const io = getIO();
      const locationLabel = await locationLabelFromNotificationData(data);
      const socketPayload: Record<string, unknown> = {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: messageForInApp,
        data: notification.data,
        isRead: false,
        createdAt: notification.createdAt,
      };
      if (locationLabel) socketPayload.locationLabel = locationLabel;
      io.to(`user:${recipientId}`).emit("notification:new", socketPayload);
    } catch {
      // Socket.io may not be initialized in scripts/tests
    }
    return true;
  } catch (err) {
    logger.error("Failed to create in-app notification", { recipientId, err });
    return false;
  }
}

export async function deliverNotificationEmail(
  options: SendNotificationOptions,
  resolvedLocationLabel: string | undefined,
): Promise<boolean> {
  const { recipientId, type, title, message } = options;
  try {
    const { sendTransactionalEmail } = await import("../services/email.service.js");
    const subject = options.emailSubject ?? title;
    let sent: boolean;
    if (options.emailTemplateFile) {
      const templateData: Record<string, unknown> = {
        ...options.emailTemplateData,
        message,
        title,
        actionUrl: options.actionUrl,
        buttonText: options.emailButtonText ?? "View",
      };
      mergeLocationIntoEmailTemplateData(templateData, resolvedLocationLabel);
      sent = await sendTransactionalEmail({
        recipientUserId: recipientId,
        subject,
        templateFile: options.emailTemplateFile,
        templateData,
      });
    } else {
      const html = options.emailHtml
        ? options.emailHtml
        : buildFallbackNotificationEmailHtml(message, resolvedLocationLabel, options.actionUrl);
      sent = await sendTransactionalEmail({ recipientUserId: recipientId, subject, html });
    }
    if (!sent) {
      logger.warn("Email notification not sent (SendGrid/SMTP unavailable or failed)", {
        recipientId,
        type,
        subject,
      });
    }
    return sent;
  } catch (err) {
    logger.error("Failed to send email notification", { recipientId, err });
    return false;
  }
}

export async function deliverNotificationSms(
  options: SendNotificationOptions,
  resolvedLocationLabel: string | undefined,
): Promise<boolean> {
  const { recipientId, message } = options;
  try {
    const { sendSMSToUser } = await import("../services/sms.service.js");
    const rawSms = options.smsBody ?? message;
    const body = resolvedLocationLabel
      ? appendLocationToPlainText(rawSms, resolvedLocationLabel)
      : rawSms;
    return await sendSMSToUser(recipientId, body);
  } catch (err) {
    logger.error("Failed to send SMS notification", { recipientId, err });
    return false;
  }
}

import mongoose from "mongoose";
import { NotificationModel, type NotificationDocument } from "../models/notification.model.js";
import { LocationModel } from "../models/location.model.js";
import { getIO } from "../config/socket.js";
import { logger } from "../utils/logger.util.js";
import type {
  SendNotificationOptions,
  NotificationListQuery,
} from "../types/notification.types.js";

function locationIdFromNotificationData(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>).locationId;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

async function locationLabelFromNotificationData(data: unknown): Promise<string | undefined> {
  const lid = locationIdFromNotificationData(data);
  if (!lid || !mongoose.isValidObjectId(lid)) return undefined;
  const loc = await LocationModel.findById(lid).select("storeName").lean();
  const name = typeof loc?.storeName === "string" ? loc.storeName.trim() : "";
  return name || undefined;
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

async function enrichNotificationsWithLocationLabels(
  notifications: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const idSet = new Set<string>();
  for (const n of notifications) {
    const lid = locationIdFromNotificationData(n.data);
    if (lid && mongoose.isValidObjectId(lid)) idSet.add(lid);
  }
  if (idSet.size === 0) {
    return notifications;
  }
  const ids = [...idSet].map((id) => new mongoose.Types.ObjectId(id));
  const locations = await LocationModel.find({ _id: { $in: ids } })
    .select("storeName")
    .lean();
  const storeNameById = new Map<string, string>();
  for (const loc of locations) {
    const name = typeof loc.storeName === "string" ? loc.storeName.trim() : "";
    if (name) storeNameById.set(String(loc._id), name);
  }
  return notifications.map((n) => {
    const lid = locationIdFromNotificationData(n.data);
    const locationLabel = lid ? storeNameById.get(lid) : undefined;
    if (!locationLabel) return n;
    return { ...n, locationLabel };
  });
}

export class NotificationService {
  async send(options: SendNotificationOptions): Promise<void> {
    await this.deliver(options);
  }

  /**
   * True if at least one enabled channel succeeded (in-app row created, email reported sent, or SMS reported sent).
   * Used by calendar jobs to roll back dedupe logs when nothing was delivered so the next run can retry.
   */
  async sendReturningDelivered(options: SendNotificationOptions): Promise<boolean> {
    return this.deliver(options);
  }

  private async deliver(options: SendNotificationOptions): Promise<boolean> {
    const {
      recipientId,
      type,
      title,
      message,
      inAppMessage,
      data,
      channels,
    } = options;

    const messageForInApp = inAppMessage ?? message;

    let delivered = false;

    const shouldInApp =
      channels.includes("in_app") || channels.includes("all");
    const shouldEmail =
      channels.includes("email") || channels.includes("all");
    const shouldSms =
      channels.includes("sms") || channels.includes("all");

    const resolvedLocationLabel =
      shouldEmail || shouldSms ? await locationLabelFromNotificationData(data) : undefined;

    if (shouldInApp) {
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
        delivered = true;

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
      } catch (err) {
        logger.error("Failed to create in-app notification", { recipientId, err });
      }
    }

    if (shouldEmail) {
      try {
        const { sendTransactionalEmail } = await import("./email.service.js");
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
          if (resolvedLocationLabel) {
            const locLine = templateData.locationLine;
            const locName = templateData.locationName;
            const hasExisting =
              (typeof locLine === "string" && locLine.trim() !== "") ||
              (typeof locName === "string" && locName.trim() !== "");
            if (!hasExisting) {
              templateData.locationName = resolvedLocationLabel;
            }
          }
          sent = await sendTransactionalEmail({
            recipientUserId: recipientId,
            subject,
            templateFile: options.emailTemplateFile,
            templateData,
          });
        } else {
          let html: string;
          if (options.emailHtml) {
            html = options.emailHtml;
          } else {
            let body = `<p>${escapeHtmlForEmail(message)}</p>`;
            if (resolvedLocationLabel) {
              body += `<p style="margin-top:12px"><strong>Location:</strong> ${escapeHtmlForEmail(resolvedLocationLabel)}</p>`;
            }
            html = `${body}${options.actionUrl ? `<p><a href="${options.actionUrl}">Click here</a></p>` : ""}`;
          }
          sent = await sendTransactionalEmail({ recipientUserId: recipientId, subject, html });
        }
        if (sent) delivered = true;
        if (!sent) {
          logger.warn("Email notification not sent (SendGrid/SMTP unavailable or failed)", {
            recipientId,
            type,
            subject,
          });
        }
      } catch (err) {
        logger.error("Failed to send email notification", { recipientId, err });
      }
    }

    if (shouldSms) {
      try {
        const { sendSMSToUser } = await import("./sms.service.js");
        const rawSms = options.smsBody ?? message;
        const body = resolvedLocationLabel
          ? appendLocationToPlainText(rawSms, resolvedLocationLabel)
          : rawSms;
        const sent = await sendSMSToUser(recipientId, body);
        if (sent) delivered = true;
      } catch (err) {
        logger.error("Failed to send SMS notification", { recipientId, err });
      }
    }

    return delivered;
  }

  async getForUser(userId: string, query: NotificationListQuery = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = query;
    const filter: Record<string, unknown> = { recipientId: userId };
    if (unreadOnly) filter.isRead = false;

    const [rawNotifications, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationModel.countDocuments(filter),
    ]);

    const notifications = await enrichNotificationsWithLocationLabels(
      rawNotifications as Array<Record<string, unknown>>,
    );

    return { notifications, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return NotificationModel.countDocuments({ recipientId: userId, isRead: false });
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await NotificationModel.updateOne(
      { _id: notificationId, recipientId: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return result.modifiedCount > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await NotificationModel.updateMany(
      { recipientId: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return result.modifiedCount;
  }
}

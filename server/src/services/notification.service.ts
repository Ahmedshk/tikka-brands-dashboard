import { NotificationModel } from "../models/notification.model.js";
import { getIO } from "../config/socket.js";
import { logger } from "../utils/logger.util.js";
import type {
  SendNotificationOptions,
  NotificationListQuery,
} from "../types/notification.types.js";

export class NotificationService {
  async send(options: SendNotificationOptions): Promise<void> {
    const {
      recipientId,
      type,
      title,
      message,
      data,
      channels,
    } = options;

    const shouldInApp =
      channels.includes("in_app") || channels.includes("all");
    const shouldEmail =
      channels.includes("email") || channels.includes("all");
    const shouldSms =
      channels.includes("sms") || channels.includes("all");

    if (shouldInApp) {
      try {
        const notification = await NotificationModel.create({
          recipientId,
          type,
          title,
          message,
          data,
        });

        try {
          const io = getIO();
          io.to(`user:${recipientId}`).emit("notification:new", {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            isRead: false,
            createdAt: notification.createdAt,
          });
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
          const templateData = {
            ...options.emailTemplateData,
            message,
            title,
            actionUrl: options.actionUrl,
            buttonText: options.emailButtonText ?? "View",
          };
          sent = await sendTransactionalEmail({
            recipientUserId: recipientId,
            subject,
            templateFile: options.emailTemplateFile,
            templateData,
          });
        } else {
          const html = options.emailHtml ?? `<p>${message}</p>${options.actionUrl ? `<p><a href="${options.actionUrl}">Click here</a></p>` : ""}`;
          sent = await sendTransactionalEmail({ recipientUserId: recipientId, subject, html });
        }
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
        const body = options.smsBody ?? message;
        await sendSMSToUser(recipientId, body);
      } catch (err) {
        logger.error("Failed to send SMS notification", { recipientId, err });
      }
    }
  }

  async getForUser(userId: string, query: NotificationListQuery = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = query;
    const filter: Record<string, unknown> = { recipientId: userId };
    if (unreadOnly) filter.isRead = false;

    const [notifications, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationModel.countDocuments(filter),
    ]);

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

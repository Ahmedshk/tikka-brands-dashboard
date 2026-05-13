import { NotificationModel } from "../models/notification.model.js";
import type {
  SendNotificationOptions,
  NotificationListQuery,
} from "../types/notification.types.js";
import { locationLabelFromNotificationData } from "../utils/notificationLocationData.util.js";
import {
  deliverNotificationEmail,
  deliverNotificationInApp,
  deliverNotificationSms,
  deriveNotificationDeliverChannels,
} from "../utils/notificationDeliver.util.js";
import { enrichNotificationsWithLocationLabels } from "../utils/notificationListEnrich.util.js";

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

    const { shouldInApp, shouldEmail, shouldSms } =
      deriveNotificationDeliverChannels(channels);

    const resolvedLocationLabel =
      shouldEmail || shouldSms ? await locationLabelFromNotificationData(data) : undefined;

    if (shouldInApp) {
      const ok = await deliverNotificationInApp({
        recipientId,
        type,
        title,
        messageForInApp,
        data,
      });
      if (ok) delivered = true;
    }

    if (shouldEmail) {
      const sent = await deliverNotificationEmail(options, resolvedLocationLabel);
      if (sent) delivered = true;
    }

    if (shouldSms) {
      const sent = await deliverNotificationSms(options, resolvedLocationLabel);
      if (sent) delivered = true;
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
      rawNotifications as unknown as Array<Record<string, unknown>>,
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

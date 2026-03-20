import type { Request, Response, NextFunction } from "express";
import { NotificationService } from "../services/notification.service.js";
import { AppError } from "../utils/errors.util.js";

const notificationService = new NotificationService();

export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const unreadOnly = req.query.unreadOnly === "true";
    const result = await notificationService.getForUser(userId, { page, limit, unreadOnly });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
}

export async function markAsRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError("Notification ID required", 400);
    const updated = await notificationService.markAsRead(id, req.user!.userId);
    if (!updated) throw new AppError("Notification not found or already read", 404);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function markAllAsRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const count = await notificationService.markAllAsRead(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
}

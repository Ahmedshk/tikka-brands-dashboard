import type { Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "review_self_upcoming",
  "review_self_available",
  "review_self_due",
  "review_self_late",
  "review_self_past_due",
  "review_manager_pending",
  "review_manager_past_due",
  "review_director_pending",
  "review_director_past_due",
  "review_approved",
  "review_rejected",
  "review_sharing_pending",
  "review_sharing_past_due",
  "review_checkin_due",
  "review_checkin_past_due",
  "review_completed",
  "general",
  "disciplinary_threshold_crossed",
  "disciplinary_document_signed",
  "disciplinary_points_expired",
  "disciplinary_incident_created",
  "disciplinary_employee_sign_pending",
  "disciplinary_manager_signed",
  "disciplinary_signing_aborted",
  "calendar_event_reminder",
  "calendar_event_hour_before",
  "calendar_event_start",
  "alert_goal_sales_warning",
  "alert_goal_sales_critical",
  "alert_goal_labor_pct_warning",
  "alert_goal_labor_pct_critical",
  "alert_goal_hours_warning",
  "alert_goal_hours_critical",
  "alert_goal_spmh_warning",
  "alert_goal_spmh_critical",
  "alert_goal_food_cost_warning",
  "alert_goal_food_cost_critical",
  "alert_inventory_delivery_overdue",
  "alert_training_overdue",
  "alert_pip_pending",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms", "all"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface INotification {
  _id?: string;
  recipientId: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SendNotificationOptions {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[];
  emailSubject?: string;
  emailHtml?: string;
  /** EJS template file (e.g. review-email.ejs) for styled email; used when no emailHtml */
  emailTemplateFile?: string;
  /** Data for the email template (e.g. firstName, actionUrl, buttonText) */
  emailTemplateData?: Record<string, unknown>;
  smsBody?: string;
  /** Link to include in email/SMS, e.g. review form URL */
  actionUrl?: string;
  /** Button label in template when actionUrl is present (default: View) */
  emailButtonText?: string;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

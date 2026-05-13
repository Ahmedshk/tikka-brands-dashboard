import { Router } from "express";
import authRoutes from "./auth.routes.js";
import locationRoutes from "./location.routes.js";
import logoRoutes from "./logo.routes.js";
import goalRoutes from "./goal.routes.js";
import commandCenterRoutes from "./commandCenter.routes.js";
import salesLaborRoutes from "./salesLabor.routes.js";
import inventoryRoutes from "./inventory.routes.js";
import roleRoutes from "./role.routes.js";
import userRoutes from "./user.routes.js";
import trainingRoutes from "./training.routes.js";
import notificationRoutes from "./notification.routes.js";
import profileRoutes from "./profile.routes.js";
import reviewSettingsRoutes from "./reviewSettings.routes.js";
import reviewCycleRoutes from "./reviewCycle.routes.js";
import disciplinarySettingsRoutes from "./disciplinarySettings.routes.js";
import disciplinaryIncidentRoutes from "./disciplinaryIncident.routes.js";
import kitchenPerformanceRoutes from "./kitchenPerformance.routes.js";
import activityLogRoutes from "./activityLog.routes.js";
import calendarRoutes from "./calendar.routes.js";
import adobeSignWebhookRoutes from "./adobeSignWebhook.routes.js";
import marketManWebhookRoutes from "./marketManWebhook.routes.js";
import integrationSyncRoutes from "./integrationSync.routes.js";
import alertNotificationSettingsRoutes from "./alertNotificationSettings.routes.js";
import {
  getSelfReviewByToken,
  getSelfReviewDocumentByToken,
  submitSelfReviewByToken,
} from "../controllers/reviewCycle.controller.js";
import { healthCheck } from "../controllers/health.controller.js";
import { proxyProfileImage, proxyDocument } from "../controllers/proxy.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";

const router = Router();

// Health check (no auth required)
router.get("/health", healthCheck);

// Adobe Sign webhook (no auth — Adobe POSTs from their servers)
router.use("/webhooks", adobeSignWebhookRoutes);
// MarketMan order webhooks (no shared-secret verification)
router.use("/webhooks", marketManWebhookRoutes);

// Proxy image (no auth so img src works)
router.get("/proxy/image/:userId", proxyProfileImage);

// Proxy document (auth required)
router.get("/proxy/document", authenticate, attachUserContext, proxyDocument);

// Auth routes
router.use("/auth", authRoutes);

// Roles (auth + permission required)
router.use("/roles", roleRoutes);

// Users (auth + user-management permission required)
router.use("/users", userRoutes);

// Location management (auth + role required)
router.use("/locations", locationRoutes);

// Logos (auth + role required)
router.use("/logos", logoRoutes);

// Goal setting (auth + role required)
router.use("/goals", goalRoutes);

// Command Center KPIs (auth + role required)
router.use("/command-center", commandCenterRoutes);

// Sales & Labor Detail (auth + role required)
router.use("/sales-labor", salesLaborRoutes);

// Inventory & Food Cost KPIs (auth + role required)
router.use("/inventory", inventoryRoutes);

// Training management (auth + training-management permission required)
router.use("/trainings", trainingRoutes);

// Notifications (auth required, no specific page permission)
router.use("/notifications", notificationRoutes);

// Current user profile (auth required, no page permission)
router.use("/profile", profileRoutes);

// Review settings (auth required; GET allowed for all, PUT requires review-settings permission)
router.use("/reviews/settings", reviewSettingsRoutes);

// Public self-review by token (no auth)
router.get("/reviews/self-review/by-token", getSelfReviewByToken);
router.get("/reviews/self-review/document", getSelfReviewDocumentByToken);
router.post("/reviews/self-review/submit-by-token", submitSelfReviewByToken);

// Review cycles (auth required)
router.use("/reviews/cycles", reviewCycleRoutes);

// Disciplinary settings (auth required; GET allowed for all, PUT requires disciplinary-settings permission)
router.use("/disciplinary/settings", disciplinarySettingsRoutes);

// Disciplinary management (auth + disciplinary-management permission required)
router.use("/disciplinary", disciplinaryIncidentRoutes);

// Kitchen performance (auth + kitchen-performance permission required)
router.use("/kitchen-performance", kitchenPerformanceRoutes);

// Activity log (auth + activity-log permission required)
router.use("/activity-log", activityLogRoutes);

// Calendar & event notification settings
router.use("/calendar", calendarRoutes);

// Alert notification settings (Command Center dynamic alerts)
router.use("/alert-notification-settings", alertNotificationSettingsRoutes);

// Integration data sync (admin)
router.use("/integration-sync", integrationSyncRoutes);

export default router;

import { Router } from "express";
import calendarEventRoutes from "./calendarEvent.routes.js";
import calendarEventTypeRoutes from "./calendarEventType.routes.js";
import calendarNotificationSettingsRoutes from "./calendarNotificationSettings.routes.js";

const router = Router();

router.use("/events", calendarEventRoutes);
router.use("/event-types", calendarEventTypeRoutes);
router.use("/notification-settings", calendarNotificationSettingsRoutes);

export default router;

import { Router } from "express";
import calendarEventRoutes from "./calendarEvent.routes.js";
import calendarEventTypeRoutes from "./calendarEventType.routes.js";
import calendarNotificationSettingsRoutes from "./calendarNotificationSettings.routes.js";
import integratedGoogleCalendarRoutes from "./integratedGoogleCalendar.routes.js";

const router = Router();

router.use("/events", calendarEventRoutes);
router.use("/event-types", calendarEventTypeRoutes);
router.use("/notification-settings", calendarNotificationSettingsRoutes);
router.use("/integrations/google-calendars", integratedGoogleCalendarRoutes);

export default router;

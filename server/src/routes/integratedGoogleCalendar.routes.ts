import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requireAnyPermission, requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  createIntegratedGoogleCalendarBodySchema,
  deleteIntegratedGoogleCalendarParamsSchema,
  updateIntegratedGoogleCalendarSchema,
} from "../validators/calendar.validators.js";
import {
  createIntegratedGoogleCalendar,
  deleteIntegratedGoogleCalendar,
  getIntegratedGoogleCalendarsInfo,
  listIntegratedGoogleCalendars,
  updateIntegratedGoogleCalendar,
} from "../controllers/integratedGoogleCalendar.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);

router.get(
  "/",
  requireAnyPermission(["events-notifications-settings", "calendar-events"]),
  listIntegratedGoogleCalendars,
);
router.get(
  "/info",
  requireAnyPermission(["events-notifications-settings", "calendar-events"]),
  getIntegratedGoogleCalendarsInfo,
);
router.post(
  "/",
  requirePermission("events-notifications-settings"),
  validate(createIntegratedGoogleCalendarBodySchema),
  createIntegratedGoogleCalendar,
);
router.patch(
  "/:id",
  requirePermission("events-notifications-settings"),
  validate(updateIntegratedGoogleCalendarSchema),
  updateIntegratedGoogleCalendar,
);
router.delete(
  "/:id",
  requirePermission("events-notifications-settings"),
  validate(deleteIntegratedGoogleCalendarParamsSchema),
  deleteIntegratedGoogleCalendar,
);

export default router;

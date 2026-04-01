import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requireAnyPermission, requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  createEventTypeBodySchema,
  updateEventTypeBodySchema,
} from "../validators/calendar.validators.js";
import {
  createCalendarEventType,
  deleteCalendarEventType,
  listCalendarEventTypesActive,
  listCalendarEventTypesAll,
  updateCalendarEventType,
} from "../controllers/calendarEventType.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);

router.get(
  "/",
  requireAnyPermission(["calendar-events", "events-notifications-settings"]),
  listCalendarEventTypesActive,
);
router.get(
  "/all",
  requirePermission("events-notifications-settings"),
  listCalendarEventTypesAll,
);
router.post(
  "/",
  requirePermission("events-notifications-settings"),
  validate(createEventTypeBodySchema),
  createCalendarEventType,
);
router.patch(
  "/:id",
  requirePermission("events-notifications-settings"),
  validate(updateEventTypeBodySchema),
  updateCalendarEventType,
);
router.delete("/:id", requirePermission("events-notifications-settings"), deleteCalendarEventType);

export default router;

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  createCalendarEventBodySchema,
  listCalendarEventsQuerySchema,
  syncCalendarBodySchema,
  updateCalendarEventBodySchema,
} from "../validators/calendar.validators.js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  syncCalendarEvents,
  updateCalendarEvent,
} from "../controllers/calendarEvent.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);
router.use(requirePermission("calendar-events"));

router.get("/", requireLocationAccess, validate(listCalendarEventsQuerySchema), listCalendarEvents);
router.post("/", requireLocationAccess, validate(createCalendarEventBodySchema), createCalendarEvent);
router.post("/sync", validate(syncCalendarBodySchema), syncCalendarEvents);
router.patch("/:id", validate(updateCalendarEventBodySchema), updateCalendarEvent);
router.delete("/:id", deleteCalendarEvent);

export default router;

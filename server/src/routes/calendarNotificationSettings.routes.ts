import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import { updateNotificationSettingsBodySchema } from "../validators/calendar.validators.js";
import {
  getCalendarNotificationSettings,
  updateCalendarNotificationSettings,
} from "../controllers/calendarNotificationSettings.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);
router.use(requirePermission("events-notifications-settings"));

router.get("/", getCalendarNotificationSettings);
router.put("/", validate(updateNotificationSettingsBodySchema), updateCalendarNotificationSettings);

export default router;

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import { updateAlertNotificationSettingsBodySchema } from "../validators/alertNotification.validators.js";
import {
  getAlertNotificationSettings,
  updateAlertNotificationSettings,
} from "../controllers/alertNotificationSettings.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);
router.use(requirePermission("alerts-notifications-settings"));

router.get("/", getAlertNotificationSettings);
router.put("/", validate(updateAlertNotificationSettingsBodySchema), updateAlertNotificationSettings);

export default router;

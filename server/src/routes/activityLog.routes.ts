import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import { getActivityLogQuerySchema } from "../validators/activityLog.validators.js";
import { getActivityLog } from "../controllers/activityLog.controller.js";

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission("activity-log"));

router.get("/", requireLocationAccess, validate(getActivityLogQuerySchema), getActivityLog);

export default router;

import { Router } from "express";
import { getGoals, upsertGoals } from "../controllers/goal.controller.js";
import { validate } from "../utils/zod.util.js";
import {
  getGoalsQuerySchema,
  upsertGoalsSchema,
} from "../validators/goal.validators.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requireLocationAccess);

// Fetch goals: allowed for any authenticated user (e.g. dashboard pages that show goal comparison).
router.get("/", validate(getGoalsQuerySchema), getGoals);

// Create/update goals: requires Goal Setting page permission.
router.put("/", requirePermission('goal-setting'), validate(upsertGoalsSchema), upsertGoals);

export default router;

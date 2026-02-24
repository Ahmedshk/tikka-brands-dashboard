import { Router } from "express";
import { getGoals, upsertGoals } from "../controllers/goal.controller.js";
import { validate } from "../utils/zod.util.js";
import {
  getGoalsQuerySchema,
  upsertGoalsSchema,
} from "../validators/goal.validators.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission('goal-setting'));
router.use(requireLocationAccess);

router.get("/", validate(getGoalsQuerySchema), getGoals);
router.put("/", validate(upsertGoalsSchema), upsertGoals);

export default router;

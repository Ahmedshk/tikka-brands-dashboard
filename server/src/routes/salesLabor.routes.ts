import { Router } from "express";
import { getSalesLaborKPIs } from "../controllers/salesLabor.controller.js";
import { validate } from "../utils/zod.util.js";
import { getSalesLaborKPIsQuerySchema } from "../validators/salesLabor.validators.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/rbac.middleware.js";
import { UserRole } from "../types/user.types.js";

const router = Router();

router.use(authenticate);
router.use(
  requireRole([
    UserRole.OWNER,
    UserRole.DIRECTOR_OF_OPERATIONS,
    UserRole.DISTRICT_MANAGER,
  ]),
);

router.get(
  "/kpis",
  validate(getSalesLaborKPIsQuerySchema),
  getSalesLaborKPIs,
);

export default router;

import { Router } from "express";
import {
  getSalesLaborKPIs,
  getHourlyBreakdown,
  getSalesTrend,
} from "../controllers/salesLabor.controller.js";
import { validate } from "../utils/zod.util.js";
import {
  getSalesLaborKPIsQuerySchema,
  getHourlyBreakdownQuerySchema,
  getSalesTrendQuerySchema,
} from "../validators/salesLabor.validators.js";
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

router.get(
  "/hourly-breakdown",
  validate(getHourlyBreakdownQuerySchema),
  getHourlyBreakdown,
);

router.get(
  "/sales-trend",
  validate(getSalesTrendQuerySchema),
  getSalesTrend,
);

export default router;

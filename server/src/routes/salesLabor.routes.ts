import { Router } from "express";
import {
  getSalesLaborKPIs,
  getHourlyBreakdown,
  getSalesTrend,
  getSalesTrendKpi,
  getSalesByCategory,
  getTimesheet,
} from "../controllers/salesLabor.controller.js";
import { validate } from "../utils/zod.util.js";
import {
  getSalesLaborKPIsQuerySchema,
  getHourlyBreakdownQuerySchema,
  getSalesTrendQuerySchema,
  getSalesTrendKpiQuerySchema,
  getSalesByCategoryQuerySchema,
  getTimesheetQuerySchema,
} from "../validators/salesLabor.validators.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission('sales-labor-detail'));
router.use(requireLocationAccess);

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

router.get(
  "/sales-trend-kpi",
  validate(getSalesTrendKpiQuerySchema),
  getSalesTrendKpi,
);

router.get(
  "/sales-by-category",
  validate(getSalesByCategoryQuerySchema),
  getSalesByCategory,
);

router.get(
  "/timesheet",
  validate(getTimesheetQuerySchema),
  getTimesheet,
);

export default router;

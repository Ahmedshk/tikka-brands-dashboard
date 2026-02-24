import { Router } from "express";
import {
  getSalesLaborKPIs,
  getHourlyBreakdown,
  getSalesTrend,
  getSalesTrendKpi,
  getSalesByCategory,
} from "../controllers/salesLabor.controller.js";
import { validate } from "../utils/zod.util.js";
import {
  getSalesLaborKPIsQuerySchema,
  getHourlyBreakdownQuerySchema,
  getSalesTrendQuerySchema,
  getSalesTrendKpiQuerySchema,
  getSalesByCategoryQuerySchema,
} from "../validators/salesLabor.validators.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate);
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

export default router;

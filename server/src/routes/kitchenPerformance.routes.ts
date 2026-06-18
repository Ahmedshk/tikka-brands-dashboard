import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  getKitchenPerformanceDetailsQuerySchema,
  getKitchenPerformanceQuerySchema,
  importKitchenPerformanceBodySchema,
  runKitchenPerformanceReportBodySchema,
} from "../validators/kitchenPerformance.validators.js";
import {
  getKitchenPerformanceDetails,
  getKitchenPerformance,
  importKitchenPerformanceCsv,
  handleKitchenPerformanceUploadError,
  runKitchenPerformanceReport,
} from "../controllers/kitchenPerformance.controller.js";

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission("kitchen-performance"));

router.get(
  "/",
  requireLocationAccess,
  validate(getKitchenPerformanceQuerySchema),
  getKitchenPerformance,
);

router.get(
  "/details",
  requireLocationAccess,
  validate(getKitchenPerformanceDetailsQuerySchema),
  getKitchenPerformanceDetails,
);

router.post(
  "/import",
  handleKitchenPerformanceUploadError,
  validate(importKitchenPerformanceBodySchema),
  importKitchenPerformanceCsv,
);

router.post(
  "/report",
  requireLocationAccess,
  validate(runKitchenPerformanceReportBodySchema),
  runKitchenPerformanceReport,
);

export default router;

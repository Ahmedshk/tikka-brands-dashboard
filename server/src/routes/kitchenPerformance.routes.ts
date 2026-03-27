import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  getKitchenPerformanceQuerySchema,
  importKitchenPerformanceBodySchema,
} from "../validators/kitchenPerformance.validators.js";
import {
  getKitchenPerformance,
  importKitchenPerformanceCsv,
  handleKitchenPerformanceUploadError,
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

router.post(
  "/import",
  handleKitchenPerformanceUploadError,
  validate(importKitchenPerformanceBodySchema),
  importKitchenPerformanceCsv,
);

export default router;

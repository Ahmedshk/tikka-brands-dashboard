import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  getIntegrationSyncLogsSchema,
  postIntegrationSyncSchema,
  postIntegrationSyncRunAllTodaySchema,
} from "../validators/integrationSync.validators.js";
import {
  getIntegrationSyncActive,
  getIntegrationSyncLogs,
  postIntegrationSync,
  postIntegrationSyncRunAllToday,
} from "../controllers/integrationSync.controller.js";

const router = Router();

router.use(
  authenticate,
  attachUserContext,
  requirePermission("data-sync-settings"),
);

router.post("/run", validate(postIntegrationSyncSchema), postIntegrationSync);
router.post(
  "/run-all-today",
  validate(postIntegrationSyncRunAllTodaySchema),
  postIntegrationSyncRunAllToday,
);
router.get("/logs", validate(getIntegrationSyncLogsSchema), getIntegrationSyncLogs);
router.get("/active", getIntegrationSyncActive);

export default router;

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import {
  getReviewSettings,
  updateReviewSettings,
} from "../controllers/reviewSettings.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);

router.get("/", getReviewSettings);
router.put("/", requirePermission("review-settings"), updateReviewSettings);

export default router;

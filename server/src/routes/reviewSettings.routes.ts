import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import {
  getReviewSettings,
  handleUploadReviewQuestionnaireDocumentError,
  uploadReviewQuestionnaireDocument,
  updateReviewSettings,
} from "../controllers/reviewSettings.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);

router.get("/", getReviewSettings);
router.put("/", requirePermission("review-settings"), updateReviewSettings);
router.post(
  "/upload-document",
  requirePermission("review-settings"),
  handleUploadReviewQuestionnaireDocumentError,
  uploadReviewQuestionnaireDocument,
);

export default router;

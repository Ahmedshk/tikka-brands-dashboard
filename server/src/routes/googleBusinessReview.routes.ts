import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import { listGoogleBusinessReviewsQuerySchema } from "../validators/googleBusinessReview.validators.js";
import { listGoogleBusinessReviews } from "../controllers/googleBusinessReview.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);
router.use(requirePermission("ratings-and-reviews"));

router.get(
  "/",
  validate(listGoogleBusinessReviewsQuerySchema),
  listGoogleBusinessReviews,
);

export default router;

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import {
  getCycles,
  getCycleSnapshot,
  getCycleById,
  getDashboard,
  submitSelfReview,
  getSelfReview,
  completeManagerReview,
  submitManagerReview,
  updateManagerReview,
  getManagerReview,
  approveReview,
  rejectReview,
  createActionPlan,
  getActionPlan,
  completeReview,
  submitCheckIn,
  uploadCheckInDocument,
  uploadMiddleware,
  initializeCycles,
  startCycleForUser,
} from "../controllers/reviewCycle.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);

router.get("/dashboard", getDashboard);
router.get("/", getCycles);
router.post("/initialize", initializeCycles);
router.post("/start-for-user", startCycleForUser);
router.get("/:id/snapshot", getCycleSnapshot);
router.get("/:id", getCycleById);

router.post("/:id/self-review", submitSelfReview);
router.get("/:id/self-review", getSelfReview);

router.post("/:id/manager-review/complete", completeManagerReview);
router.post("/:id/manager-review", submitManagerReview);
router.put("/:id/manager-review", updateManagerReview);
router.get("/:id/manager-review", getManagerReview);

router.post("/:id/approve", approveReview);
router.post("/:id/reject", rejectReview);

router.post("/:id/action-plan", createActionPlan);
router.get("/:id/action-plan", getActionPlan);
router.post("/:id/complete", completeReview);

router.post("/:id/check-in/:period", submitCheckIn);
router.post("/:id/check-in/:period/upload", uploadMiddleware, uploadCheckInDocument);

export default router;

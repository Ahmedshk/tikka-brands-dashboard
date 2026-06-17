import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission, requireLocationAccess } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  getActivityLogOrderNoteQuerySchema,
  getActivityLogQuerySchema,
  putActivityLogOrderNoteSchema,
} from "../validators/activityLog.validators.js";
import {
  getActivityLog,
  getActivityLogOrderNote,
  putActivityLogOrderNote,
} from "../controllers/activityLog.controller.js";

const router = Router();

/** Copy `body.locationId` to `query` so `requireLocationAccess` can authorize PUT bodies. */
function attachBodyLocationIdToQuery(req: Request, _res: Response, next: NextFunction): void {
  const bodyLocationId = req.body?.locationId;
  if (typeof bodyLocationId === "string" && bodyLocationId.length > 0) {
    req.query.locationId = bodyLocationId;
  }
  next();
}

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission("activity-log"));

router.get(
  "/orders/:squareOrderId/notes",
  requireLocationAccess,
  validate(getActivityLogOrderNoteQuerySchema),
  getActivityLogOrderNote,
);
router.put(
  "/orders/:squareOrderId/notes",
  validate(putActivityLogOrderNoteSchema),
  attachBodyLocationIdToQuery,
  requireLocationAccess,
  putActivityLogOrderNote,
);
router.get("/", requireLocationAccess, validate(getActivityLogQuerySchema), getActivityLog);

export default router;

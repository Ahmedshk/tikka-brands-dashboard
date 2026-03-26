import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import { updateDisciplinarySettingsSchema } from "../validators/disciplinary.validators.js";
import {
  getDisciplinarySettings,
  updateDisciplinarySettings,
} from "../controllers/disciplinarySettings.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);

router.get("/", getDisciplinarySettings);
router.put(
  "/",
  requirePermission("disciplinary-settings"),
  validate(updateDisciplinarySettingsSchema),
  updateDisciplinarySettings,
);

export default router;

import { Router } from "express";
import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
} from "../controllers/role.controller.js";
import { validate } from "../utils/zod.util.js";
import {
  listRolesQuerySchema,
  createRoleSchema,
  updateRoleSchema,
  getRoleParamsSchema,
  deleteRoleParamsSchema,
} from "../validators/role.validators.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission('rbac-management'));

router.get("/", validate(listRolesQuerySchema), listRoles);
router.get("/:id", validate(getRoleParamsSchema), getRole);
router.post("/", validate(createRoleSchema), createRole);
router.put("/:id", validate(updateRoleSchema), updateRole);
router.delete("/:id", validate(deleteRoleParamsSchema), deleteRole);

export default router;

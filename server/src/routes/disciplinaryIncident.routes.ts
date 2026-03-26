import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../utils/zod.util.js";
import {
  getEmployeesQuerySchema,
  getEmployeeParamsSchema,
  getIncidentsQuerySchema,
  createIncidentSchema,
  sendForSignatureParamsSchema,
  embeddedSignIncidentParamsSchema,
} from "../validators/disciplinary.validators.js";
import {
  getEmployees,
  getEmployeeDetails,
  getEmployeeIncidents,
  createIncident,
  sendForSignature,
  getEmbeddedSignUrl,
} from "../controllers/disciplinaryIncident.controller.js";

const router = Router();

router.use(authenticate, attachUserContext);
router.use(requirePermission("disciplinary-management"));

router.get("/employees", validate(getEmployeesQuerySchema), getEmployees);
router.get(
  "/employees/:employeeId",
  validate(getEmployeeParamsSchema),
  getEmployeeDetails,
);
router.get(
  "/employees/:employeeId/incidents",
  validate(getIncidentsQuerySchema),
  getEmployeeIncidents,
);
router.post("/incidents", validate(createIncidentSchema), createIncident);
router.post(
  "/employees/:employeeId/send-for-signature",
  validate(sendForSignatureParamsSchema),
  sendForSignature,
);
router.get(
  "/incidents/:incidentId/embedded-sign-url",
  validate(embeddedSignIncidentParamsSchema),
  getEmbeddedSignUrl,
);

export default router;

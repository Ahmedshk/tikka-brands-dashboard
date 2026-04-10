import { Router } from 'express';
import { getCommandCenterKPIs, getHourlySales } from '../controllers/commandCenter.controller.js';
import {
  getCommandCenterAlerts,
  getCommandCenterAlertHistory,
  dismissCommandCenterAlerts,
} from '../controllers/commandCenterAlerts.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  getCommandCenterKPIsQuerySchema,
  getHourlySalesQuerySchema,
} from '../validators/commandCenter.validators.js';
import {
  getCommandCenterAlertsQuerySchema,
  getCommandCenterAlertHistoryQuerySchema,
  dismissCommandCenterAlertsBodySchema,
} from '../validators/alertNotification.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission, requireLocationAccess } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission('command-center'));
router.use(requireLocationAccess);

router.get('/kpis', validate(getCommandCenterKPIsQuerySchema), getCommandCenterKPIs);
router.get('/hourly-sales', validate(getHourlySalesQuerySchema), getHourlySales);
router.get('/alerts', validate(getCommandCenterAlertsQuerySchema), getCommandCenterAlerts);
router.get(
  '/alerts/history',
  validate(getCommandCenterAlertHistoryQuerySchema),
  getCommandCenterAlertHistory,
);
router.post(
  '/alerts/dismiss',
  validate(dismissCommandCenterAlertsBodySchema),
  dismissCommandCenterAlerts,
);

export default router;

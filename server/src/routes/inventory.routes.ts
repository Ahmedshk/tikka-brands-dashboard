import { Router } from 'express';
import {
  getInventoryKPIsHandler,
  getValidCountDatesHandler,
  getOrdersHandler,
} from '../controllers/inventory.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  getInventoryKPIsQuerySchema,
  getValidCountDatesQuerySchema,
  getOrdersQuerySchema,
} from '../validators/inventory.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission, requireLocationAccess } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requirePermission('inventory-food-cost'));
router.use(requireLocationAccess);

router.get(
  '/kpis',
  validate(getInventoryKPIsQuerySchema),
  getInventoryKPIsHandler
);

router.get(
  '/valid-count-dates',
  validate(getValidCountDatesQuerySchema),
  getValidCountDatesHandler
);

router.get('/orders', validate(getOrdersQuerySchema), getOrdersHandler);

export default router;

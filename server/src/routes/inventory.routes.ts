import { Router } from 'express';
import {
  getInventoryKPIsHandler,
  getOrdersHandler,
} from '../controllers/inventory.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  getInventoryKPIsQuerySchema,
  getOrdersQuerySchema,
} from '../validators/inventory.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { UserRole } from '../types/user.types.js';

const router = Router();

router.use(authenticate);
router.use(
  requireRole([
    UserRole.OWNER,
    UserRole.DIRECTOR_OF_OPERATIONS,
    UserRole.DISTRICT_MANAGER,
  ])
);

router.get(
  '/kpis',
  validate(getInventoryKPIsQuerySchema),
  getInventoryKPIsHandler
);

router.get('/orders', validate(getOrdersQuerySchema), getOrdersHandler);

export default router;

import { Router } from 'express';
import { createLogo, getLogos, getLogoById } from '../controllers/logo.controller.js';
import { validate } from '../utils/zod.util.js';
import { createLogoSchema, getLogoSchema } from '../validators/logo.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { UserRole } from '../types/user.types.js';

const router = Router();

router.use(authenticate);
router.use(requireRole([UserRole.OWNER, UserRole.DIRECTOR_OF_OPERATIONS, UserRole.DISTRICT_MANAGER]));

router.post('/', validate(createLogoSchema), createLogo);
router.get('/', getLogos);
router.get('/:id', validate(getLogoSchema), getLogoById);

export default router;

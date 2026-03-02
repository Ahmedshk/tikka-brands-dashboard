import { Router } from 'express';
import { createLogo, getLogos, getLogoById } from '../controllers/logo.controller.js';
import { validate } from '../utils/zod.util.js';
import { createLogoSchema, getLogoSchema } from '../validators/logo.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission('location-management'));

router.post('/', validate(createLogoSchema), createLogo);
router.get('/', getLogos);
router.get('/:id', validate(getLogoSchema), getLogoById);

export default router;

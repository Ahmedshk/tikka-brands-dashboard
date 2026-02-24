import { Router } from 'express';
import {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
} from '../controllers/location.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  createLocationSchema,
  updateLocationSchema,
  getLocationSchema,
  deleteLocationSchema,
  getLocationsQuerySchema,
} from '../validators/location.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission, requireLocationAccess } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requirePermission('location-management'));
router.use(requireLocationAccess);

router.get('/', validate(getLocationsQuerySchema), getLocations);
router.get('/:id', validate(getLocationSchema), getLocationById);
router.post('/', validate(createLocationSchema), createLocation);
router.put('/:id', validate(updateLocationSchema), updateLocation);
router.delete('/:id', validate(deleteLocationSchema), deleteLocation);

export default router;

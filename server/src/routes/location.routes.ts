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
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission, requireLocationAccess } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticate);
router.use(attachUserContext);

// List locations: any authenticated user (for navbar switcher). Controller filters by allowedLocationIds.
router.get('/', validate(getLocationsQuerySchema), getLocations);

// Create, read one, update, delete: require location-management permission and location access
router.use(requirePermission('location-management'));
router.use(requireLocationAccess);
router.get('/:id', validate(getLocationSchema), getLocationById);
router.post('/', validate(createLocationSchema), createLocation);
router.put('/:id', validate(updateLocationSchema), updateLocation);
router.delete('/:id', validate(deleteLocationSchema), deleteLocation);

export default router;

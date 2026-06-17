import { Router } from 'express';
import multer from 'multer';
import {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
  reorderLocations,
} from '../controllers/location.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  createLocationSchema,
  updateLocationSchema,
  getLocationSchema,
  deleteLocationSchema,
  getLocationsQuerySchema,
  reorderLocationsSchema,
} from '../validators/location.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission, requireLocationAccess } from '../middleware/rbac.middleware.js';
import { UPLOAD_CONFIG } from '../config/upload.config.js';

const logoConfig = UPLOAD_CONFIG.location_logo;
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: logoConfig.maxBytes },
  fileFilter(_req, file, cb) {
    if (!logoConfig.allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error(`Invalid file type. Allowed: ${logoConfig.allowedMimeTypes.join(', ')}`));
      return;
    }
    cb(null, true);
  },
}).single('logo');

const router = Router();

router.use(authenticate);
router.use(attachUserContext);

// List locations: any authenticated user (for navbar switcher). Controller filters by allowedLocationIds.
router.get('/', validate(getLocationsQuerySchema), getLocations);

// Create, read one, update, delete, reorder: require location-management permission and location access
router.use(requirePermission('location-management'));
router.use(requireLocationAccess);
router.put('/order', validate(reorderLocationsSchema), reorderLocations);
router.get('/:id', validate(getLocationSchema), getLocationById);
router.post('/', uploadLogo, validate(createLocationSchema), createLocation);
router.put('/:id', uploadLogo, validate(updateLocationSchema), updateLocation);
router.delete('/:id', validate(deleteLocationSchema), deleteLocation);

export default router;

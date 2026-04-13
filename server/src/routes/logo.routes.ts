import { Router } from 'express';
import multer from 'multer';
import { createLogo, getLogos, getLogoById } from '../controllers/logo.controller.js';
import { validate } from '../utils/zod.util.js';
import { getLogoSchema } from '../validators/logo.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { UPLOAD_CONFIG } from '../config/upload.config.js';

const logoConfig = UPLOAD_CONFIG.location_logo;
const uploadLogoFile = multer({
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
router.use(requirePermission('location-management'));

router.post('/', uploadLogoFile, createLogo);
router.get('/', getLogos);
router.get('/:id', validate(getLogoSchema), getLogoById);

export default router;

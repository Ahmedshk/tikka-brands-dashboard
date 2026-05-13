import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { validate } from '../utils/zod.util.js';
import { handleProfileImageUploadError } from '../middleware/profile-image-upload.middleware.js';
import { uploadProfileImage } from '../controllers/user.controller.js';
import { getProfile, putProfile, changePassword } from '../controllers/profile.controller.js';
import { putProfileBodySchema, changePasswordBodySchema } from '../validators/profile.validators.js';

const router = Router();

router.use(authenticate, attachUserContext);

router.get('/', getProfile);
router.post('/upload-image', handleProfileImageUploadError, uploadProfileImage);
router.put('/', validate(putProfileBodySchema), putProfile);
router.post('/change-password', validate(changePasswordBodySchema), changePassword);

export default router;

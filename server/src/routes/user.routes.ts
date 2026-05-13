import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser, terminateUser, resendInvite, syncFromSquare, syncFromHomebase, uploadProfileImage } from '../controllers/user.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
  deleteUserParamsSchema,
  resendInviteParamsSchema,
  syncFromSquareSchema,
  syncFromHomebaseSchema,
} from '../validators/user.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { handleProfileImageUploadError } from '../middleware/profile-image-upload.middleware.js';

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission('user-management'));

router.get('/', validate(listUsersQuerySchema), listUsers);
router.post('/', validate(createUserSchema), createUser);
router.post('/upload-profile-image', handleProfileImageUploadError, uploadProfileImage);
router.put('/:id', validate(updateUserSchema), updateUser);
router.delete('/:id', validate(deleteUserParamsSchema), deleteUser);
router.post('/sync-square', validate(syncFromSquareSchema), syncFromSquare);
router.post('/sync-homebase', validate(syncFromHomebaseSchema), syncFromHomebase);
router.post('/:id/resend-invite', validate(resendInviteParamsSchema), resendInvite);
router.post('/:id/terminate', validate(resendInviteParamsSchema), terminateUser);

export default router;

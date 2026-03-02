import { Router, Request, Response, NextFunction } from 'express';
import { listUsers, createUser, updateUser, deleteUser, resendInvite, syncFromSquare, uploadProfileImage } from '../controllers/user.controller.js';
import { validate } from '../utils/zod.util.js';
import {
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
  deleteUserParamsSchema,
  resendInviteParamsSchema,
  syncFromSquareSchema,
} from '../validators/user.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { uploadProfileImageMulter } from '../middleware/upload-profile.middleware.js';
import { ValidationError } from '../utils/errors.util.js';

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission('user-management'));

function handleUploadError(req: Request, res: Response, next: NextFunction): void {
  uploadProfileImageMulter(req, res, (err: unknown) => {
    if (err) {
      const e = err as Error & { code?: string };
      let message: string;
      if (e.code === 'LIMIT_FILE_SIZE') {
        message = 'File too large. Profile image must be 2 MB or less.';
      } else if (e instanceof Error) {
        message = e.message;
      } else {
        message = 'Upload failed';
      }
      next(new ValidationError(message));
      return;
    }
    next();
  });
}

router.get('/', validate(listUsersQuerySchema), listUsers);
router.post('/', validate(createUserSchema), createUser);
router.post('/upload-profile-image', handleUploadError, uploadProfileImage);
router.put('/:id', validate(updateUserSchema), updateUser);
router.delete('/:id', validate(deleteUserParamsSchema), deleteUser);
router.post('/sync-square', validate(syncFromSquareSchema), syncFromSquare);
router.post('/:id/resend-invite', validate(resendInviteParamsSchema), resendInvite);

export default router;

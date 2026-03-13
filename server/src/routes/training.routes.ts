import { Router } from 'express';
import { validate } from '../utils/zod.util.js';
import { createTrainingSchema } from '../validators/training.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  handleUploadTrainingDocumentError,
  uploadTrainingDocument,
  createTraining,
  listTrainings,
} from '../controllers/training.controller.js';

const router = Router();

router.use(authenticate);
router.use(attachUserContext);
router.use(requirePermission('training-management'));

router.post(
  '/upload-document',
  handleUploadTrainingDocumentError,
  uploadTrainingDocument
);
router.post('/', validate(createTrainingSchema), createTraining);
router.get('/', listTrainings);

export default router;

import { Router } from 'express';
import { validate } from '../utils/zod.util.js';
import {
  createTrainingSchema,
  updateTrainingSchema,
  getTrainingByIdSchema,
  deleteTrainingSchema,
} from '../validators/training.validators.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachUserContext } from '../middleware/user-context.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  handleUploadTrainingDocumentError,
  uploadTrainingDocument,
  createTraining,
  listTrainings,
  getTrainingById,
  updateTraining,
  deleteTraining,
} from '../controllers/training.controller.js';
import trainingAssignmentRoutes from './trainingAssignment.routes.js';

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
router.use('/assignments', trainingAssignmentRoutes);
router.get('/:id', validate(getTrainingByIdSchema), getTrainingById);
router.put('/:id', validate(updateTrainingSchema), updateTraining);
router.delete('/:id', validate(deleteTrainingSchema), deleteTraining);

export default router;

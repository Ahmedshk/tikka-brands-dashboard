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
import { requireAnyPermission, requirePermission } from '../middleware/rbac.middleware.js';
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

/** Catalog CRUD: Training Management or Admin Training Settings. */
const trainingCatalogAuth = requireAnyPermission([
  'training-management',
  'training-settings',
]);
/** Assignments stay on Training Management only. */
const assignmentsAuth = requirePermission('training-management');

router.post(
  '/upload-document',
  trainingCatalogAuth,
  handleUploadTrainingDocumentError,
  uploadTrainingDocument
);
router.post('/', trainingCatalogAuth, validate(createTrainingSchema), createTraining);
router.get('/', trainingCatalogAuth, listTrainings);
router.use('/assignments', assignmentsAuth, trainingAssignmentRoutes);
router.get('/:id', trainingCatalogAuth, validate(getTrainingByIdSchema), getTrainingById);
router.put('/:id', trainingCatalogAuth, validate(updateTrainingSchema), updateTraining);
router.delete('/:id', trainingCatalogAuth, validate(deleteTrainingSchema), deleteTraining);

export default router;

import { Router } from 'express';
import { validate } from '../utils/zod.util.js';
import {
  createAssignmentsSchema,
  listAssignmentsSchema,
  getAssignmentByIdSchema,
  updateAssignmentSchema,
  deleteAssignmentSchema,
} from '../validators/trainingAssignment.validators.js';
import {
  createAssignments,
  listAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  uploadAssignmentDocument,
} from '../controllers/trainingAssignment.controller.js';
import { handleUploadTrainingDocumentError } from '../controllers/training.controller.js';

const router = Router();

router.post('/', validate(createAssignmentsSchema), createAssignments);
router.get('/', validate(listAssignmentsSchema), listAssignments);
router.get('/:id', validate(getAssignmentByIdSchema), getAssignmentById);
router.put(
  '/:id/upload-document',
  validate(getAssignmentByIdSchema),
  handleUploadTrainingDocumentError,
  uploadAssignmentDocument
);
router.put('/:id', validate(updateAssignmentSchema), updateAssignment);
router.delete('/:id', validate(deleteAssignmentSchema), deleteAssignment);

export default router;

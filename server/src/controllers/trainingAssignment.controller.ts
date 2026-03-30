import { Request, Response, NextFunction } from 'express';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { CLOUDINARY_FOLDERS } from '../config/upload.config.js';
import { TrainingAssignmentService } from '../services/trainingAssignment.service.js';
import { ValidationError } from '../utils/errors.util.js';
import { getFileFormat } from '../utils/training.util.js';

const assignmentService = new TrainingAssignmentService();

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function getResourceType(mimetype: string): 'image' | 'raw' {
  return IMAGE_MIMES.has(mimetype) ? 'image' : 'raw';
}

export const createAssignments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { trainingId, userIds } = req.body;
    const assignedBy = (req as Request & { user?: { userId: string } }).user?.userId;
    const result = await assignmentService.createAssignments(
      { trainingId, userIds },
      assignedBy
    );
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const listAssignments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const locationId = (req.query.locationId as string) ?? '';
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const limitRaw = req.query.limit;
    const limit =
      limitRaw === undefined || limitRaw === ''
        ? undefined
        : Number(limitRaw);
    const { list, total } = await assignmentService.listByLocationId(locationId, {
      ...(search != null && search !== '' && { search }),
      ...(limit != null && !Number.isNaN(limit) && limit > 0 && { limit }),
    });
    res.status(200).json({ success: true, data: { assignments: list, total } });
  } catch (error) {
    next(error);
  }
};

export const getAssignmentById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!id) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }
    const actorUserId = (req as Request & { user?: { userId: string } }).user?.userId;
    const assignment = await assignmentService.getById(id, actorUserId);
    if (!assignment) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }
    res.status(200).json({ success: true, data: { assignment } });
  } catch (error) {
    next(error);
  }
};

export const updateAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!id) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }
    const actorUserId = (req as Request & { user?: { userId: string } }).user?.userId;
    const { moduleProgress } = req.body;
    const assignment = await assignmentService.update(id, { moduleProgress }, actorUserId);
    if (!assignment) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }
    res.status(200).json({ success: true, data: { assignment } });
  } catch (error) {
    next(error);
  }
};

export const deleteAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!id) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }
    const actorUserId = (req as Request & { user?: { userId: string } }).user?.userId;
    const deleted = await assignmentService.delete(id, actorUserId);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
};

export const uploadAssignmentDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!id) {
      res.status(400).json({ success: false, message: 'Assignment ID is required' });
      return;
    }
    const file = req.file;
    if (!file?.buffer) {
      throw new ValidationError('No file provided. Use multipart field "file".');
    }
    const actorUserId = (req as Request & { user?: { userId: string } }).user?.userId;
    const assignment = await assignmentService.getById(id, actorUserId);
    if (!assignment) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }
    const folder = `${CLOUDINARY_FOLDERS.employee_training}/${assignment.userId}`;
    const result = await uploadToCloudinary(
      { buffer: file.buffer, mimetype: file.mimetype },
      folder,
      { resource_type: 'auto' }
    );
    const resourceType = getResourceType(file.mimetype);
    const format = result.format ?? getFileFormat(file.originalname, file.mimetype);
    res.status(200).json({
      success: true,
      data: {
        publicId: result.public_id,
        resourceType,
        filename: file.originalname || undefined,
        format: format || undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

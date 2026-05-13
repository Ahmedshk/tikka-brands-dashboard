import { Request, Response, NextFunction } from 'express';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { CLOUDINARY_FOLDERS } from '../config/upload.config.js';
import { TrainingService } from '../services/training.service.js';
import { ValidationError } from '../utils/errors.util.js';
import { slugifyTrainingName, getFileFormat } from '../utils/training.util.js';
import { uploadTrainingDocumentMulter } from '../middleware/upload-training.middleware.js';
import { routeParamId } from '../utils/routeParams.util.js';

const trainingService = new TrainingService();

/** MIME types treated as image for delivery. PDF/Word/Excel are raw. */
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

export function handleUploadTrainingDocumentError(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadTrainingDocumentMulter(req, res, (err: unknown) => {
    if (err) {
      const e = err as Error & { code?: string };
      let message: string;
      if (e.code === 'LIMIT_FILE_SIZE') {
        message = 'File too large. Training documents must be 10 MB or less.';
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

export const uploadTrainingDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    if (!file?.buffer) {
      throw new ValidationError('No file provided. Use multipart field "file".');
    }
    const trainingName = typeof req.body.trainingName === 'string' ? req.body.trainingName.trim() : '';
    if (!trainingName) {
      throw new ValidationError('trainingName is required.');
    }
    const slug = slugifyTrainingName(trainingName);
    const folder = `${CLOUDINARY_FOLDERS.training}/${slug}`;
    const result = await uploadToCloudinary(
      { buffer: file.buffer, mimetype: file.mimetype },
      folder,
      { resource_type: 'auto' }
    );
    const resourceType = getResourceType(file.mimetype);
    const format =
      result.format ?? getFileFormat(file.originalname, file.mimetype);
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

export const createTraining = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, modules, assignToRoles } = req.body;
    const training = await trainingService.create({ name, modules, assignToRoles });
    res.status(201).json({ success: true, data: { training } });
  } catch (error) {
    next(error);
  }
};

export const listTrainings = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const trainings = await trainingService.list();
    res.status(200).json({ success: true, data: { trainings } });
  } catch (error) {
    next(error);
  }
};

export const getTrainingById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = routeParamId(req, 'id');
    const training = await trainingService.getById(id);
    if (!training) {
      res.status(404).json({ success: false, message: 'Training not found' });
      return;
    }
    res.status(200).json({ success: true, data: { training } });
  } catch (error) {
    next(error);
  }
};

export const updateTraining = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = routeParamId(req, 'id');
    const { name, modules, assignToRoles } = req.body;
    const training = await trainingService.update(id, { name, modules, assignToRoles });
    if (!training) {
      res.status(404).json({ success: false, message: 'Training not found' });
      return;
    }
    res.status(200).json({ success: true, data: { training } });
  } catch (error) {
    next(error);
  }
};

export const deleteTraining = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = routeParamId(req, 'id');
    const deleted = await trainingService.delete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Training not found' });
      return;
    }
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
};

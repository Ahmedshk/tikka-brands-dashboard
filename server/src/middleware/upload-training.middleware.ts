import multer from 'multer';
import { UPLOAD_CONFIG } from '../config/upload.config.js';

const trainingConfig = UPLOAD_CONFIG.training_document;

const storage = multer.memoryStorage();

export const uploadTrainingDocumentMulter = multer({
  storage,
  limits: { fileSize: trainingConfig.maxBytes },
  fileFilter(_req, file, cb) {
    if (!trainingConfig.allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error(`Invalid file type. Allowed: ${trainingConfig.allowedMimeTypes.join(', ')}`));
      return;
    }
    cb(null, true);
  },
}).single('file');

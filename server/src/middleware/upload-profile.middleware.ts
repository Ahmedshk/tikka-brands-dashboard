import multer from 'multer';
import { UPLOAD_CONFIG, CLOUDINARY_FOLDERS } from '../config/upload.config.js';

const profileConfig = UPLOAD_CONFIG.profile_image;

const storage = multer.memoryStorage();

export const uploadProfileImageMulter = multer({
  storage,
  limits: { fileSize: profileConfig.maxBytes },
  fileFilter(_req, file, cb) {
    if (!profileConfig.allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error(`Invalid file type. Allowed: ${profileConfig.allowedMimeTypes.join(', ')}`));
      return;
    }
    cb(null, true);
  },
}).single('image');

export const PROFILE_IMAGE_FOLDER = CLOUDINARY_FOLDERS.profile_image;

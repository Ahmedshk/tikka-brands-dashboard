import type { Request, Response, NextFunction } from 'express';
import { uploadProfileImageMulter } from './upload-profile.middleware.js';
import { ValidationError } from '../utils/errors.util.js';

/** Multer wrapper for profile image uploads (shared by `/users` and `/profile`). */
export function handleProfileImageUploadError(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
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

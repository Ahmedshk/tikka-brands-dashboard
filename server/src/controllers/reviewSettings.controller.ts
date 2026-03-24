import type { Request, Response, NextFunction } from "express";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { CLOUDINARY_FOLDERS } from "../config/upload.config.js";
import { ReviewSettingsService } from "../services/reviewSettings.service.js";
import { ValidationError } from "../utils/errors.util.js";
import { getFileFormat } from "../utils/training.util.js";
import { uploadTrainingDocumentMulter } from "../middleware/upload-training.middleware.js";

const service = new ReviewSettingsService();

/** MIME types treated as image for delivery. PDF/Word/Excel are raw. */
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function getResourceType(mimetype: string): "image" | "raw" {
  return IMAGE_MIMES.has(mimetype) ? "image" : "raw";
}

export function handleUploadReviewQuestionnaireDocumentError(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  uploadTrainingDocumentMulter(req, res, (err: unknown) => {
    if (err) {
      const e = err as Error & { code?: string };
      let message: string;
      if (e.code === "LIMIT_FILE_SIZE") {
        message = "File too large. Questionnaire documents must be 10 MB or less.";
      } else if (e instanceof Error) {
        message = e.message;
      } else {
        message = "Upload failed";
      }
      next(new ValidationError(message));
      return;
    }
    next();
  });
}

export async function getReviewSettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await service.get();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

export async function updateReviewSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const updated = await service.upsert(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function uploadReviewQuestionnaireDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = req.file;
    if (!file?.buffer) {
      throw new ValidationError('No file provided. Use multipart field "file".');
    }

    const result = await uploadToCloudinary(
      { buffer: file.buffer, mimetype: file.mimetype },
      CLOUDINARY_FOLDERS.questionnaires,
      { resource_type: "auto" },
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
  } catch (err) {
    next(err);
  }
}

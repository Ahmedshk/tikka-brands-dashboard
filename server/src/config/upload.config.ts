/**
 * Upload config: limits and folders. Types live in types/upload.types.js.
 */
import type { UploadType, UploadTypeConfig } from "../types/upload.types.js";

export type { UploadType, UploadTypeConfig };

export const UPLOAD_CONFIG: Record<UploadType, UploadTypeConfig> = {
  profile_image: {
    maxBytes: 2 * 1024 * 1024, // 2 MB
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/webp', 'image/png'],
  },
};

export const CLOUDINARY_FOLDERS = {
  /** Parent folder for Tikka brands assets */
  TIKKA_BRANDS: 'tikka_brands',
  profile_image: 'tikka_brands/profile_image',
} as const;

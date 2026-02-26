/**
 * Upload type definitions and limits. Add new keys (e.g. 'document') for other file types.
 */
export type UploadType = 'profile_image';

export interface UploadTypeConfig {
  maxBytes: number;
  allowedMimeTypes: string[];
}

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

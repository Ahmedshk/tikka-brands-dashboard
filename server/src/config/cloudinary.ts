import { v2 as cloudinary } from 'cloudinary';
import type { UploadToCloudinaryResult } from '../types/cloudinary.types.js';

const isConfigured = (): boolean => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(name && key && secret);
};

export const initializeCloudinary = (): void => {
  if (!isConfigured()) return;
  // With `exactOptionalPropertyTypes`, Cloudinary config requires definite strings.
  // `isConfigured()` guarantees these env vars are set.
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME as string;
  const apiKey = process.env.CLOUDINARY_API_KEY as string;
  const apiSecret = process.env.CLOUDINARY_API_SECRET as string;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
};

export function getCloudinaryConfigured(): boolean {
  return isConfigured();
}

/** MIME types uploaded as Cloudinary resource_type 'image'. PDF/Word/Excel are 'raw'. */
const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

/**
 * Upload a file buffer to Cloudinary. Uses base64 data URI.
 * @param file - buffer and mimetype
 * @param folder - e.g. tikka_brands/profile_image
 * @param options - optional resource_type; defaults to 'image' for image mimes, 'raw' otherwise
 */
export async function uploadToCloudinary(
  file: { buffer: Buffer; mimetype: string },
  folder: string,
  options?: { resource_type?: 'image' | 'raw' | 'auto'; public_id?: string }
): Promise<UploadToCloudinaryResult> {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
  }
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const mimeDefaultResourceType = IMAGE_MIMES.has(file.mimetype) ? 'image' : 'raw';
  const resourceType =
    options?.resource_type === 'auto'
      ? mimeDefaultResourceType
      : options?.resource_type ?? mimeDefaultResourceType;
  const uploadOptions: Record<string, unknown> = {
    folder,
    resource_type: resourceType,
  };
  if (options?.public_id) {
    uploadOptions.public_id = options.public_id;
    // When re-uploading to the same public_id (disciplinary signed docs),
    // force overwrite + CDN invalidation so downstream fetches get latest bytes.
    uploadOptions.overwrite = true;
    uploadOptions.invalidate = true;
  }
  const result = await cloudinary.uploader.upload(dataUri, uploadOptions);
  const format = (result as { format?: string }).format;
  const base: UploadToCloudinaryResult = {
    public_id: result.public_id,
    secure_url: result.secure_url ?? '',
  };
  return format ? { ...base, format } : base;
}

/**
 * Delete an asset from Cloudinary by public_id.
 * Logs and ignores errors (e.g. 404) so callers can still throw the original error.
 * @param resourceType - 'image' (default) or 'raw'; must match how the asset was uploaded.
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'raw' = 'image'
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('[Cloudinary] deleteFromCloudinary failed for', publicId, err);
  }
}

/**
 * Build the secure URL for an image by public_id (for proxy fetch).
 * Options can request Cloudinary to serve optimized format/quality.
 */
export function getSecureUrl(
  publicId: string,
  options?: { fetch_format?: string; quality?: string }
): string {
  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: options?.fetch_format ?? 'auto',
    quality: options?.quality ?? 'auto',
  });
}

/**
 * Build the secure URL for a document (image or raw) by public_id (for proxy fetch).
 * Use resourceType so Cloudinary serves the correct asset type.
 */
export function getSecureDocumentUrl(
  publicId: string,
  resourceType: 'image' | 'raw' = 'raw'
): string {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType,
    ...(resourceType === 'image' && { fetch_format: 'auto', quality: 'auto' }),
  });
}

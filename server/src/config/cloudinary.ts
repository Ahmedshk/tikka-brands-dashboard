import { v2 as cloudinary } from 'cloudinary';

const isConfigured = (): boolean => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(name && key && secret);
};

export const initializeCloudinary = (): void => {
  if (!isConfigured()) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};

export function getCloudinaryConfigured(): boolean {
  return isConfigured();
}

export interface UploadToCloudinaryResult {
  public_id: string;
  secure_url: string;
}

/**
 * Upload a file buffer to Cloudinary. Uses base64 data URI.
 * @param file - buffer and mimetype
 * @param folder - e.g. tikka_brands/profile_image
 */
export async function uploadToCloudinary(
  file: { buffer: Buffer; mimetype: string },
  folder: string
): Promise<UploadToCloudinaryResult> {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
  }
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'image',
  });
  return {
    public_id: result.public_id,
    secure_url: result.secure_url ?? '',
  };
}

/**
 * Delete an asset from Cloudinary by public_id.
 * Logs and ignores errors (e.g. 404) so callers can still throw the original error.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  if (!isConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('[Cloudinary] deleteFromCloudinary failed for', publicId, err);
    // Optionally rethrow; plan says "log and swallow" for create-failure cleanup
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

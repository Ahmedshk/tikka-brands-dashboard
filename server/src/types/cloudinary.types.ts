/**
 * Cloudinary upload result (used by config/cloudinary).
 */
export interface UploadToCloudinaryResult {
  public_id: string;
  secure_url: string;
  /** File format from Cloudinary (e.g. docx, xlsx, pdf). */
  format?: string;
}

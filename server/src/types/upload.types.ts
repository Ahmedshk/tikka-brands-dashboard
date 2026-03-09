/**
 * Upload type definitions and config shape. Actual limits live in config.
 */
export type UploadType = "profile_image";

export interface UploadTypeConfig {
  maxBytes: number;
  allowedMimeTypes: string[];
}

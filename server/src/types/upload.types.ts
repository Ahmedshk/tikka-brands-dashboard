/**
 * Upload type definitions and config shape. Actual limits live in config.
 */
export type UploadType = "profile_image" | "training_document";

export interface UploadTypeConfig {
  maxBytes: number;
  allowedMimeTypes: string[];
}

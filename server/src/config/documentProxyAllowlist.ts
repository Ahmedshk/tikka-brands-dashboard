import { CLOUDINARY_FOLDERS } from "./upload.config.js";

/** Cloudinary public_id prefixes allowed for authenticated or token-scoped document streaming. */
export const ALLOWED_DOCUMENT_PUBLIC_ID_PREFIXES: string[] = [
  "tikka_brands/training/",
  `${CLOUDINARY_FOLDERS.questionnaires}/`,
  "tikka_brands/employee_training/",
  "tikka_brands/employee_reviews/",
  "employee_training/",
  "employee-reviews/",
  "tikka_brands/disciplinary_management/",
];

export function isDocumentPublicIdAllowed(publicId: string): boolean {
  return ALLOWED_DOCUMENT_PUBLIC_ID_PREFIXES.some((prefix) => publicId.startsWith(prefix));
}

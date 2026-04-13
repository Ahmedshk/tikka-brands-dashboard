/**
 * Upload config: limits and folders. Types live in types/upload.types.js.
 */
import type { UploadType, UploadTypeConfig } from "../types/upload.types.js";

export const UPLOAD_CONFIG: Record<UploadType, UploadTypeConfig> = {
  profile_image: {
    maxBytes: 2 * 1024 * 1024, // 2 MB
    allowedMimeTypes: ["image/jpeg", "image/jpg", "image/webp", "image/png"],
  },
  training_document: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  location_logo: {
    maxBytes: 2 * 1024 * 1024, // 2 MB
    allowedMimeTypes: ["image/jpeg", "image/jpg", "image/webp", "image/png", "image/svg+xml"],
  },
};

export const CLOUDINARY_FOLDERS = {
  /** Parent folder for Tikka brands assets */
  TIKKA_BRANDS: "tikka_brands",
  profile_image: "tikka_brands/profile_image",
  training: "tikka_brands/training",
  questionnaires: "tikka_brands/questionnaires",
  /** Assignment documents by employee: tikka_brands/employee_training/<userId> */
  employee_training: "tikka_brands/employee_training",
  /** Review check-in documents by employee: tikka_brands/employee_reviews/<userId>/<30-day-checkin|60-day-checkin> */
  employee_reviews: "tikka_brands/employee_reviews",
  /** Signed disciplinary documents by employee: tikka_brands/disciplinary_management/<userId> */
  disciplinary_management: "tikka_brands/disciplinary_management",
  location_logos: "tikka_brands/location_logos",
} as const;

export function getDisciplinaryFolder(employeeId: string): string {
  return `${CLOUDINARY_FOLDERS.disciplinary_management}/${employeeId}`;
}

export function getReviewCheckInFolder(
  employeeId: string,
  period: "30" | "60",
): string {
  const suffix = period === "30" ? "30-day-checkin" : "60-day-checkin";
  return `${CLOUDINARY_FOLDERS.employee_reviews}/${employeeId}/${suffix}`;
}

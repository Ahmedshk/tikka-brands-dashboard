import multer from "multer";

const ALLOWED_MIME_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
] as const;

const storage = multer.memoryStorage();

export const uploadKitchenPerformanceCsvMulter = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const hasAllowedMime = ALLOWED_MIME_TYPES.includes(
      file.mimetype as (typeof ALLOWED_MIME_TYPES)[number],
    );
    const hasCsvExtension = file.originalname.toLowerCase().endsWith(".csv");
    if (!hasAllowedMime && !hasCsvExtension) {
      cb(new Error("Invalid file type. Only CSV files are allowed."));
      return;
    }
    cb(null, true);
  },
}).single("file");

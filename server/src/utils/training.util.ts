/**
 * Sanitize training name for use as Cloudinary folder segment.
 * Lowercase, replace spaces with underscore, strip invalid chars.
 */
export function slugifyTrainingName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'training';
}

/** MIME to file extension for training documents (Word, Excel, PDF, images). */
const MIMETYPE_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Get file format (extension) for storage so downloads use the correct extension.
 * Prefers extension from originalFilename, then mimetype mapping.
 */
export function getFileFormat(originalFilename: string | undefined, mimetype: string): string | undefined {
  if (originalFilename?.includes('.')) {
    const ext = originalFilename.replace(/^.*\./, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (ext) return ext;
  }
  return MIMETYPE_TO_EXT[mimetype];
}

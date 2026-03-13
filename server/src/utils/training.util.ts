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

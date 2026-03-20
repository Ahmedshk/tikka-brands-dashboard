import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.util.js';
import { getSecureUrl, getSecureDocumentUrl } from '../config/cloudinary.js';

const userService = new UserService();

const ALLOWED_DOC_PREFIXES = [
  'tikka_brands/training/',
  'tikka_brands/employee_training/',
  'tikka_brands/employee_reviews/',
  // Legacy prefixes kept for backward compatibility with previously uploaded assets.
  'employee_training/',
  'employee-reviews/',
];

/**
 * GET /api/proxy/image/:userId
 * Fetches the user's profile image from Cloudinary on the backend and serves it to the client.
 * The client never receives or sees the Cloudinary URL.
 */
export const proxyProfileImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.params.userId;
    if (userId === undefined || Array.isArray(userId)) {
      res.status(400).json({ success: false, message: 'Invalid user id' });
      return;
    }
    const user = await userService.getUserById(userId);
    if (!user?.profileImagePublicId) {
      throw new NotFoundError('Profile image not found');
    }
    const cloudinaryUrl = getSecureUrl(user.profileImagePublicId, {
      fetch_format: 'auto',
      quality: 'auto',
    });
    const imageResponse = await fetch(cloudinaryUrl);
    if (!imageResponse.ok) {
      throw new NotFoundError('Profile image not found');
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
    const contentLength = imageResponse.headers.get('content-length');
    res.set({
      'Content-Type': contentType,
      'Content-Length': contentLength ?? buffer.length.toString(),
      'Cache-Control': 'private, max-age=86400',
      ETag: `"${Buffer.from(user.profileImagePublicId).toString('base64')}"`,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/proxy/document?publicId=...&resourceType=raw|image&filename=...
 * Fetches a document from Cloudinary and streams it. Auth required.
 * publicId must start with tikka_brands/training/ to avoid leaking other assets.
 * Optional filename: used for Content-Disposition so downloads open with correct extension (e.g. report.docx).
 */
export const proxyDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publicId = typeof req.query.publicId === 'string' ? req.query.publicId.trim() : '';
    if (!publicId) {
      throw new ValidationError('publicId is required');
    }
    if (!ALLOWED_DOC_PREFIXES.some((prefix) => publicId.startsWith(prefix))) {
      throw new ValidationError('Invalid document');
    }
    const resourceType =
      req.query.resourceType === 'image' ? 'image' : 'raw';
    const suggestedFilename =
      typeof req.query.filename === 'string' ? req.query.filename.trim() : '';
    const cloudinaryUrl = getSecureDocumentUrl(publicId, resourceType);
    const docResponse = await fetch(cloudinaryUrl);
    if (!docResponse.ok) {
      throw new NotFoundError('Document not found');
    }
    const buffer = Buffer.from(await docResponse.arrayBuffer());
    const contentType = docResponse.headers.get('content-type') ?? 'application/octet-stream';
    const safeFilename =
      suggestedFilename && /^[\w\s.-]+\.\w+$/.test(suggestedFilename)
        ? suggestedFilename
        : null;
    const contentDisposition = safeFilename
      ? `inline; filename="${safeFilename.replace(/"/g, '\\"')}"`
      : (docResponse.headers.get('content-disposition') ?? 'inline');
    res.set({
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=86400',
      'Content-Disposition': contentDisposition,
    });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

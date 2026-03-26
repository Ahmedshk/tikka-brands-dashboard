import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.util.js';
import { getSecureUrl, getSecureDocumentUrl } from '../config/cloudinary.js';
import { isDocumentPublicIdAllowed } from '../config/documentProxyAllowlist.js';

const userService = new UserService();

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
 * publicId must match an allowed Cloudinary folder prefix (training, questionnaires, employee uploads, etc.).
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
    if (!isDocumentPublicIdAllowed(publicId)) {
      throw new ValidationError('Invalid document');
    }
    const resourceType =
      req.query.resourceType === 'image' ? 'image' : 'raw';
    const suggestedFilename =
      typeof req.query.filename === 'string' ? req.query.filename.trim() : '';
    // Add a cache-busting token so overwritten assets (same public_id) return fresh content.
    const cloudinaryUrl = `${getSecureDocumentUrl(publicId, resourceType)}?cb=${Date.now()}`;
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
    const escapedFilename = safeFilename
      ? safeFilename.replaceAll('"', String.raw`\"`)
      : null;
    const contentDisposition = safeFilename
      ? `inline; filename="${escapedFilename}"`
      : (docResponse.headers.get('content-disposition') ?? 'inline');
    res.set({
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Content-Disposition': contentDisposition,
    });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

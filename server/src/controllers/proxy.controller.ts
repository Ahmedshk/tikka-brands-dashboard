import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { NotFoundError } from '../utils/errors.util.js';
import { getSecureUrl } from '../config/cloudinary.js';

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
    const { userId } = req.params;
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

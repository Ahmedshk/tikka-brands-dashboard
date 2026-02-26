import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { logger } from '../utils/logger.util.js';
import { RoleRepository } from '../repositories/role.repository.js';
import type { RolePermissions } from '../types/rbac.types.js';

const roleRepository = new RoleRepository();

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token = req.cookies?.accessToken;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const decoded = verifyAccessToken(token);
    const role = await roleRepository.findByName(decoded.role);
    const permissions: RolePermissions = role?.permissions ?? { type: 'all' };
    const access = (role as { locationAccess?: string })?.locationAccess;
    const locationIds = (role as { locationIds?: unknown[] })?.locationIds ?? [];
    const allowedLocationIds: 'all' | string[] =
      access === 'specific' && locationIds.length > 0
        ? locationIds.map((l) => {
            if (l == null) return '';
            if (typeof l === 'object' && l !== null && '_id' in l)
              return String((l as { _id: unknown })._id);
            if (typeof l === 'object' && l !== null && typeof (l as { toString?: () => string }).toString === 'function')
              return (l as { toString(): string }).toString();
            if (typeof l === 'string') return l;
            return '';
          }).filter(Boolean)
        : 'all';

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role as import('../types/user.types.js').UserRole,
      permissions,
      allowedLocationIds,
    };

    next();
  } catch (error) {
    logger.error('Authentication error', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

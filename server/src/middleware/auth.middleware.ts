import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { logger } from '../utils/logger.util.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import type { RolePermissions } from '../types/rbac.types.js';
import { mergeRolePermissionsWithOverrides } from '../utils/permissions.util.js';

const roleRepository = new RoleRepository();
const userRepository = new UserRepository();

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
    const user = await userRepository.findById(decoded.userId);

    // Block archived Homebase employees from using the system
    const archivedAt = (user as unknown as { homebaseData?: { job?: { archived_at?: string | null } } })
      ?.homebaseData?.job?.archived_at;
    if (archivedAt != null && archivedAt !== '') {
      res.status(403).json({
        success: false,
        message: 'Your account has been archived. Please contact an administrator.',
      });
      return;
    }

    // Resolve role from user's current roleId (DB) so permission overrides are merged with the correct role
    let role: Awaited<ReturnType<RoleRepository['findById']>> = null;
    if (user?.roleId) {
      role = await roleRepository.findById(String(user.roleId));
    }
    role ??= await roleRepository.findByName(decoded.role);
    const rolePermissions: RolePermissions = role?.permissions ?? { type: 'all' };
    const permissions = mergeRolePermissionsWithOverrides(rolePermissions, user?.permissionOverrides ?? null);
    const access = (role as { locationAccess?: string })?.locationAccess;
    const locationIds = (role as { locationIds?: unknown[] })?.locationIds ?? [];
    let allowedLocationIds: 'all' | string[] =
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

    const locationOverrideIds = (user?.locationOverrides as unknown[] | null | undefined) ?? [];
    if (allowedLocationIds !== 'all' && locationOverrideIds.length > 0) {
      const overrideStrings = locationOverrideIds
        .map((x) => (typeof x === 'string' ? x : (x as { toString?(): string })?.toString?.() ?? ''))
        .filter(Boolean);
      allowedLocationIds = [...new Set([...allowedLocationIds, ...overrideStrings])];
    }

    const locationRemovalsRaw = (user?.locationRemovals as unknown[] | null | undefined) ?? [];
    const locationRemovals = locationRemovalsRaw
      .map((x) => (typeof x === 'string' ? x : (x as { toString?(): string })?.toString?.() ?? ''))
      .filter(Boolean);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role as import('../types/user.types.js').UserRole,
      permissions,
      permissionOverrides: user?.permissionOverrides ?? null,
      allowedLocationIds,
      permissionRemovals: user?.permissionRemovals ?? null,
      locationRemovals,
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

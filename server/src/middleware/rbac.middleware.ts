import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/user.types.js';
import { logger } from '../utils/logger.util.js';

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      logger.warn(`Access denied for role ${userRole}`, {
        userId: req.user.userId,
        requiredRoles: allowedRoles,
      });

      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Require that the user's permissions allow access to the given page.
 * If permissions.type === 'all', allow. If type === 'custom', allow only if pages includes pageId.
 */
export const requirePermission = (pageId: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const permissions = req.user.permissions;
    if (!permissions) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    if (permissions.type === 'all') {
      next();
      return;
    }

    const hasPage = permissions.pages?.some((p) => p.pageId === pageId) ?? false;
    if (!hasPage) {
      logger.warn(`Access denied: missing page permission ${pageId}`, {
        userId: req.user.userId,
      });
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Require that the user's role allows access to the requested location.
 * Reads locationId from req.query.locationId or req.params.id (for location get/update/delete).
 * If no locationId in request, passes through. If user has no allowedLocationIds, allows (backward compat).
 */
export const requireLocationAccess = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const locationId =
    (typeof req.query.locationId === "string" ? req.query.locationId : null) ??
    (typeof req.params.id === "string" ? req.params.id : null);

  if (!locationId) {
    next();
    return;
  }

  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const allowed = req.user.allowedLocationIds;
  if (!allowed) {
    next();
    return;
  }
  if (allowed === "all") {
    next();
    return;
  }
  if (allowed.includes(locationId)) {
    next();
    return;
  }

  logger.warn(`Access denied: location ${locationId} not in role's allowed locations`, {
    userId: req.user.userId,
  });
  res.status(403).json({
    success: false,
    message: "You do not have access to this location.",
  });
};

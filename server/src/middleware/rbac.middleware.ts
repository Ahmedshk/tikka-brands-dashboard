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

/** Page is fully removed only when removal entry has no components (whole-page removal). */
function isPageFullyRemoved(
  removalPages: Array<{ pageId: string; components?: string[] }>,
  pageId: string
): boolean {
  const entry = removalPages.find((p) => p.pageId === pageId);
  if (!entry) return false;
  const comps = entry.components;
  return comps == null || comps.length === 0;
}

/**
 * Require that the user's permissions allow access to the given page.
 * If permissions.type === 'all', allow unless page is fully removed (removal with empty components).
 * If type === 'custom', allow only if pages includes pageId and page is not fully removed.
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

    const removalPages = req.user.permissionRemovals?.type === 'custom' ? req.user.permissionRemovals.pages : [];
    const fullyRemoved = isPageFullyRemoved(removalPages, pageId);

    if (permissions.type === 'all') {
      if (fullyRemoved) {
        logger.warn(`Access denied: page ${pageId} removed for user`, {
          userId: req.user.userId,
        });
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
        return;
      }
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

    if (fullyRemoved) {
      logger.warn(`Access denied: page ${pageId} removed for user`, {
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
  const locationRemovals = req.user.locationRemovals ?? [];
  if (locationRemovals.includes(locationId)) {
    logger.warn(`Access denied: location ${locationId} removed for user`, {
      userId: req.user.userId,
    });
    res.status(403).json({
      success: false,
      message: "You do not have access to this location.",
    });
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

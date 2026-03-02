import { Request, Response, NextFunction } from 'express';

const USER_CONTEXT_KEYS = [
  'permissions',
  'permissionOverrides',
  'permissionRemovals',
  'allowedLocationIds',
  'locationRemovals',
] as const;

function pickUserContext(user: NonNullable<Request['user']>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of USER_CONTEXT_KEYS) {
    if (key in user) {
      out[key] = user[key as keyof typeof user];
    }
  }
  return out;
}

/**
 * Patches res.json so that every JSON response from an authenticated request
 * includes meta.user (permissions + locations). Enables the client to reflect
 * role/permission changes on the next API call without a full refresh.
 */
export function attachUserContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next();
    return;
  }

  const userContext = pickUserContext(req.user);
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    if (body != null && typeof body === 'object' && !Array.isArray(body)) {
      const obj = body as Record<string, unknown>;
      obj.meta = {
        ...(typeof obj.meta === 'object' && obj.meta != null ? obj.meta : {}),
        user: userContext,
      };
    }
    return originalJson(body);
  };

  next();
}

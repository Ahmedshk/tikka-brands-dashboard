import type { Request } from 'express';

/** Build user JSON for API responses (profile image via authenticated proxy URL). */
export function toUserDTO(
  req: Request,
  user: {
    _id?: string | { toString(): string };
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    squareId?: string;
    homebaseData?: import('../types/user.types.js').HomebaseData | null;
    role?: string | null;
    roleId?: string | null;
    isActive?: boolean;
    status?: string;
    invitationSentAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    startDate?: Date | null;
    password?: string;
    profileImagePublicId?: string | null;
    permissionOverrides?: import('../types/rbac.types.js').RolePermissions | null;
    locationOverrides?: unknown;
    permissionRemovals?: import('../types/rbac.types.js').RolePermissions | null;
    locationRemovals?: unknown;
  },
) {
  let id: string | undefined;
  if (user._id == null) {
    id = undefined;
  } else if (typeof user._id === 'string') {
    id = user._id;
  } else {
    id = user._id.toString();
  }
  const base = `${req.protocol}://${req.get('host') ?? ''}`.replace(/\/$/, '');
  const profileImagePublicId =
    user.profileImagePublicId != null && String(user.profileImagePublicId).trim() !== ''
      ? String(user.profileImagePublicId).trim()
      : null;
  const profileImageUrl =
    id && profileImagePublicId ? `${base}/api/proxy/image/${id}` : null;
  const locationOverrides = Array.isArray(user.locationOverrides)
    ? (user.locationOverrides as unknown[]).map((x) =>
        typeof x === 'string' ? x : (x as { toString?(): string })?.toString?.() ?? '',
      ).filter(Boolean)
    : null;
  const locationRemovals = Array.isArray(user.locationRemovals)
    ? (user.locationRemovals as unknown[]).map((x) =>
        typeof x === 'string' ? x : (x as { toString?(): string })?.toString?.() ?? '',
      ).filter(Boolean)
    : null;
  return {
    _id: id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    squareId: user.squareId,
    homebaseData: user.homebaseData ?? null,
    role: user.role ?? null,
    roleId: user.roleId ?? null,
    isActive: user.isActive ?? true,
    isTerminated: (user as Record<string, unknown>).isTerminated === true,
    status: user.status ?? 'active',
    invitationSentAt: user.invitationSentAt,
    startDate: (user as Record<string, unknown>).startDate ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profileImagePublicId,
    profileImageUrl,
    permissionOverrides: user.permissionOverrides ?? null,
    locationOverrides: locationOverrides?.length ? locationOverrides : null,
    permissionRemovals: user.permissionRemovals ?? null,
    locationRemovals: locationRemovals?.length ? locationRemovals : null,
  };
}

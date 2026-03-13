import bcrypt from "bcryptjs";
import { UserRepository } from "../repositories/user.repository.js";
import { RoleRepository } from "../repositories/role.repository.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/jwt.util.js";
import type { TokenPayload } from "../types/auth.types.js";
import { IUser } from "../types/user.types.js";
import { UnauthorizedError } from "../utils/errors.util.js";
import { logger } from "../utils/logger.util.js";
import type { RolePermissions } from "../types/rbac.types.js";
import { mergeRolePermissionsWithOverrides } from "../utils/permissions.util.js";

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly roleRepository: RoleRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.roleRepository = new RoleRepository();
  }

  /** Resolve permissions for a role name (from Role collection). Defaults to full access if no role found. */
  async getPermissionsForRole(roleName: string): Promise<RolePermissions> {
    const role = await this.roleRepository.findByName(roleName);
    return role?.permissions ?? { type: "all" };
  }

  /** Resolve allowed location IDs for a role. Returns 'all' or array of location IDs. */
  async getAllowedLocationIds(roleName: string): Promise<"all" | string[]> {
    const role = await this.roleRepository.findByName(roleName);
    if (!role) return "all";
    const access = (role as { locationAccess?: string }).locationAccess;
    if (access !== "specific") return "all";
    const ids = (role as { locationIds?: unknown[] }).locationIds ?? [];
    const resolved = ids
      .map((l) => {
        if (l == null) return "";
        if (typeof l === "object" && "_id" in l)
          return String((l as { _id: unknown })._id);
        if (typeof l === "object" && l !== null && typeof (l as { toString?: () => string }).toString === "function")
          return (l as { toString(): string }).toString();
        if (typeof l === "string") return l;
        return "";
      })
      .filter(Boolean);
    return resolved.length > 0 ? resolved : "all";
  }

  /** Merge role's allowed location IDs with user's location overrides. */
  private mergeLocationOverrides(
    roleLocationIds: "all" | string[],
    locationOverrides: unknown
  ): "all" | string[] {
    if (roleLocationIds === "all") return "all";
    const overrides = (locationOverrides as unknown[] | null | undefined) ?? [];
    if (overrides.length === 0) return roleLocationIds;
    const overrideStrings = overrides
      .map((x) => (typeof x === "string" ? x : (x as { toString?(): string })?.toString?.() ?? ""))
      .filter(Boolean);
    return [...new Set([...roleLocationIds, ...overrideStrings])];
  }

  async login(
    email: string,
    password: string
  ): Promise<{
    user: Omit<IUser, "password">;
    accessToken: string;
    refreshToken: string;
  }> {
    // Find user with password (select('+password') returns document with password)
    const user = await this.userRepository.findByEmail(email, true);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Verify password (user has password when found with includePassword: true)
    const userWithPassword = user as typeof user & { password: string };
    const isPasswordValid = await bcrypt.compare(password, userWithPassword.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError(
        "Your account has been deactivated. Please contact an administrator."
      );
    }

    // First login: set status to active
    if (user.status === "pending") {
      await this.userRepository.updateById(user._id.toString(), { status: "active" });
      (user as typeof user & { status: string }).status = "active";
    }

    // Resolve effective role name (from roleId or role field)
    let effectiveRoleName: string | null = null;
    if (user.roleId) {
      const roleDoc = await this.roleRepository.findById(user.roleId.toString());
      effectiveRoleName = roleDoc?.name ?? user.role ?? null;
    } else {
      effectiveRoleName = user.role ?? null;
    }

    let [permissions, allowedLocationIds] =
      effectiveRoleName != null && effectiveRoleName !== ""
        ? await Promise.all([
            this.getPermissionsForRole(effectiveRoleName),
            this.getAllowedLocationIds(effectiveRoleName),
          ])
        : [{ type: "custom" as const, pages: [] }, [] as string[]];

    permissions = mergeRolePermissionsWithOverrides(permissions, user.permissionOverrides ?? null);
    allowedLocationIds = this.mergeLocationOverrides(allowedLocationIds, user.locationOverrides);

    const tokenPayload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: effectiveRoleName ?? user.role ?? "",
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const { password: _, ...userWithoutPassword } = user as unknown as Record<string, unknown>;
    const safeUser = userWithoutPassword as Omit<IUser, "password"> & {
      permissions?: RolePermissions;
      permissionOverrides?: RolePermissions | null;
      allowedLocationIds?: "all" | string[];
      permissionRemovals?: RolePermissions | null;
      locationRemovals?: string[];
    };
    safeUser.permissions = permissions;
    safeUser.permissionOverrides = user.permissionOverrides ?? null;
    safeUser.allowedLocationIds = allowedLocationIds;
    safeUser.permissionRemovals = user.permissionRemovals ?? null;
    safeUser.locationRemovals = Array.isArray(user.locationRemovals)
      ? (user.locationRemovals as unknown[]).map((x) =>
          typeof x === "string" ? x : (x as { toString?(): string })?.toString?.() ?? ""
        ).filter(Boolean)
      : [];

    return {
      user: safeUser,
      accessToken,
      refreshToken,
    };
  }

  private verifyRefreshTokenOrThrow(token: string): TokenPayload {
    try {
      return verifyRefreshToken(token);
    } catch (err) {
      const isJwtError =
        err &&
        typeof err === "object" &&
        "name" in err &&
        (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError");
      if (isJwtError) {
        const errName = (err as { name?: string }).name ?? "Unknown";
        const errMessage = (err as { message?: string }).message ?? "";
        logger.warn("Refresh token JWT verification failed", {
          errName,
          errMessage,
        });
        if (process.env.NODE_ENV === "development") {
          try {
            verifyAccessToken(token);
            logger.warn(
              "Refresh cookie verifies as ACCESS token — client may be sending wrong cookie"
            );
          } catch {
            /* token is not the access token */
          }
        }
        throw new UnauthorizedError("Invalid or expired refresh token");
      }
      throw err;
    }
  }

  async refreshToken(token: string): Promise<{
    user: Omit<IUser, "password">;
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = this.verifyRefreshTokenOrThrow(token);
    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    if (!user.isActive) {
      throw new UnauthorizedError("Your account has been deactivated.");
    }
    let effectiveRoleName: string | null = null;
    if (user.roleId) {
      const roleDoc = await this.roleRepository.findById(user.roleId.toString());
      effectiveRoleName = roleDoc?.name ?? user.role ?? null;
    } else {
      effectiveRoleName = user.role ?? null;
    }
    let [permissions, allowedLocationIds] =
      effectiveRoleName != null && effectiveRoleName !== ""
        ? await Promise.all([
            this.getPermissionsForRole(effectiveRoleName),
            this.getAllowedLocationIds(effectiveRoleName),
          ])
        : [{ type: "custom" as const, pages: [] }, [] as string[]];

    permissions = mergeRolePermissionsWithOverrides(permissions, user.permissionOverrides ?? null);
    allowedLocationIds = this.mergeLocationOverrides(allowedLocationIds, user.locationOverrides);

    const tokenPayload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: effectiveRoleName ?? user.role ?? "",
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    const { password: _, ...refreshUserWithoutPassword } = user as unknown as Record<string, unknown>;
    const safeRefreshUser = refreshUserWithoutPassword as Omit<IUser, "password"> & {
      permissions?: RolePermissions;
      permissionOverrides?: RolePermissions | null;
      allowedLocationIds?: "all" | string[];
      permissionRemovals?: RolePermissions | null;
      locationRemovals?: string[];
    };
    safeRefreshUser.permissions = permissions;
    safeRefreshUser.permissionOverrides = user.permissionOverrides ?? null;
    safeRefreshUser.allowedLocationIds = allowedLocationIds;
    safeRefreshUser.permissionRemovals = user.permissionRemovals ?? null;
    safeRefreshUser.locationRemovals = Array.isArray(user.locationRemovals)
      ? (user.locationRemovals as unknown[]).map((x) =>
          typeof x === "string" ? x : (x as { toString?(): string })?.toString?.() ?? ""
        ).filter(Boolean)
      : [];
    return {
      user: safeRefreshUser,
      accessToken,
      refreshToken,
    };
  }

  async logout(): Promise<void> {
    // Placeholder for logout logic (token blacklisting, etc.)
    // For now, logout is handled client-side by removing cookies
  }
}

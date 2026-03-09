import bcrypt from "bcryptjs";
import { UserRepository } from "../repositories/user.repository.js";
import { RoleRepository } from "../repositories/role.repository.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  TokenPayload,
} from "../utils/jwt.util.js";
import { IUser } from "../types/user.types.js";
import { UnauthorizedError } from "../utils/errors.util.js";
import type { RolePermissions } from "../types/rbac.types.js";

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

    const [permissions, allowedLocationIds] =
      effectiveRoleName != null && effectiveRoleName !== ""
        ? await Promise.all([
            this.getPermissionsForRole(effectiveRoleName),
            this.getAllowedLocationIds(effectiveRoleName),
          ])
        : [{ type: "custom" as const, pages: [] }, [] as string[]];

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
      allowedLocationIds?: "all" | string[];
    };
    safeUser.permissions = permissions;
    safeUser.allowedLocationIds = allowedLocationIds;

    return {
      user: safeUser,
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(token: string): Promise<{
    user: Omit<IUser, "password">;
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = verifyRefreshToken(token);
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
    const [permissions, allowedLocationIds] =
      effectiveRoleName != null && effectiveRoleName !== ""
        ? await Promise.all([
            this.getPermissionsForRole(effectiveRoleName),
            this.getAllowedLocationIds(effectiveRoleName),
          ])
        : [{ type: "custom" as const, pages: [] }, [] as string[]];
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
      allowedLocationIds?: "all" | string[];
    };
    safeRefreshUser.permissions = permissions;
    safeRefreshUser.allowedLocationIds = allowedLocationIds;
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

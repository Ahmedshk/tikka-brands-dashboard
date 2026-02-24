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
    if (!role?.locations) return "all";
    if (role.locations === "all") return "all";
    return Array.isArray(role.locations) ? role.locations : "all";
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

    const [permissions, allowedLocationIds] = await Promise.all([
      this.getPermissionsForRole(user.role),
      this.getAllowedLocationIds(user.role),
    ]);

    const tokenPayload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const userWithoutPassword = user.toObject() as Omit<IUser, "password"> & {
      permissions?: RolePermissions;
      allowedLocationIds?: "all" | string[];
    };
    userWithoutPassword.permissions = permissions;
    userWithoutPassword.allowedLocationIds = allowedLocationIds;

    return {
      user: userWithoutPassword,
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
    const [permissions, allowedLocationIds] = await Promise.all([
      this.getPermissionsForRole(user.role),
      this.getAllowedLocationIds(user.role),
    ]);
    const tokenPayload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    const userWithoutPassword = user.toObject() as Omit<IUser, "password"> & {
      permissions?: RolePermissions;
      allowedLocationIds?: "all" | string[];
    };
    userWithoutPassword.permissions = permissions;
    userWithoutPassword.allowedLocationIds = allowedLocationIds;
    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }

  async logout(): Promise<void> {
    // Placeholder for logout logic (token blacklisting, etc.)
    // For now, logout is handled client-side by removing cookies
  }
}

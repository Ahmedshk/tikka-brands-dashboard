import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { UserRepository } from "../repositories/user.repository.js";
import { RoleRepository } from "../repositories/role.repository.js";
import { LocationService } from "./location.service.js";
import { UserDocument } from "../models/user.model.js";
import { IUser, UserRole } from "../types/user.types.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.util.js";
import { sendInvitationEmail } from "./mailer.service.js";
import { searchTeamMembers } from "./square.service.js";
import { getEmployeesForLocation } from "./homebase.service.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import {
  normalizeTeamMember,
  buildSyncUpdatePayload,
  buildSyncCreatePayload,
} from "../utils/syncFromSquareHelpers.js";
import {
  normalizeHomebaseEmployee,
  buildHomebaseSyncUpdatePayload,
  buildHomebaseSyncCreatePayload,
} from "../utils/syncFromHomebaseHelpers.js";
import { ReviewCycleModel } from "../models/reviewCycle.model.js";
import { ReviewCycleService } from "./reviewCycle.service.js";
import { logger } from "../utils/logger.util.js";

const OWNER_ROLE_NAME = UserRole.OWNER;
const SALT_ROUNDS = 10;

function randomPassword(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) s += chars[bytes[i]! % chars.length];
  return s;
}

/** Coerce document _id (ObjectId or string) to string without using Object's default stringification. */
function toIdString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "object") {
    return typeof (value as { toString?: () => string }).toString === "function"
      ? (value as { toString: () => string }).toString()
      : undefined;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "bigint") return value.toString();
  return undefined;
}

function toIUser(doc: UserDocument): IUser {
  const { _id, ...rest } = doc as unknown as Record<string, unknown>;
  return { ...rest, _id: toIdString(_id) } as IUser;
}

/** Coerce a location id entry (ObjectId, string, or primitive) to string without Object default stringification. */
function locationIdEntryToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "_id" in value)
    return toIdString((value as { _id: unknown })._id) ?? "";
  if (typeof value === "object") {
    return typeof (value as { toString?: () => string }).toString === "function"
      ? (value as { toString: () => string }).toString()
      : "";
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();
  return "";
}

/** Extract location id strings from a role's locationIds (populated or raw ObjectIds). */
function roleLocationIdStrings(role: { locationIds?: unknown[] }): string[] {
  const locationIds = role?.locationIds ?? [];
  return locationIds.map(locationIdEntryToString).filter(Boolean);
}

/** Extract location id strings from a user doc field (ObjectIds or strings). */
function userLocationIdStrings(arr: unknown[] | null | undefined): string[] {
  const list = arr ?? [];
  return list.map(locationIdEntryToString).filter(Boolean);
}

/**
 * Whether a user has access to a given location when considering role locations,
 * locationOverrides, and locationRemovals. Used for list filtering so results match
 * the effective locations (role ∪ overrides) \ removals.
 */
function userHasAccessToLocation(
  roleLocationAccess: string,
  roleLocationIdStrings: string[],
  locationId: string,
  locationOverrides: unknown[] | null | undefined,
  locationRemovals: unknown[] | null | undefined,
): boolean {
  const removalSet = new Set(userLocationIdStrings(locationRemovals as unknown[]));
  if (removalSet.has(locationId)) return false;

  const isRoleAll =
    roleLocationAccess !== "specific" || roleLocationIdStrings.length === 0;
  if (isRoleAll) return true;

  const baseSet = new Set(roleLocationIdStrings);
  const overrideStrings = userLocationIdStrings(locationOverrides as unknown[]);
  for (const id of overrideStrings) baseSet.add(id);
  for (const id of removalSet) baseSet.delete(id);
  return baseSet.has(locationId);
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  squareId?: string;
  homebaseData?: import('../types/user.types.js').HomebaseData | null;
  roleId?: string | null;
  profileImagePublicId?: string | null;
  startDate?: Date | null;
}

export interface SyncFromSquareResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface SyncFromHomebaseResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export class UserService {
  private readonly userRepository: UserRepository;
  private readonly roleRepository: RoleRepository;
  private readonly locationService: LocationService;

  constructor() {
    this.userRepository = new UserRepository();
    this.roleRepository = new RoleRepository();
    this.locationService = new LocationService();
  }

  /** Throws if removing or deactivating the last user with Owner role. */
  private async ensureNotLastOwner(
    currentRole: string | null,
    newRole?: string | null,
    newIsActive?: boolean,
  ): Promise<void> {
    const isCurrentlyOwner = currentRole === OWNER_ROLE_NAME;
    const wouldLeaveOwnerRole =
      newRole !== undefined && newRole !== OWNER_ROLE_NAME;
    const wouldDeactivate = newIsActive === false;
    if (!isCurrentlyOwner) return;
    if (!wouldLeaveOwnerRole && !wouldDeactivate) return;

    const owners = await this.userRepository.findByRole(OWNER_ROLE_NAME);
    const ownerCount = owners.length;
    if (ownerCount <= 1) {
      throw new ForbiddenError(
        "Cannot remove or deactivate the last user with the Owner role.",
      );
    }
  }

  async createUser(
    payload: CreateUserPayload,
    options?: { sendInvite?: boolean },
  ): Promise<IUser> {
    const existing = await this.userRepository.findByEmail(payload.email);
    if (existing) {
      throw new ConflictError("A user with this email already exists.");
    }

    let role: string | null = null;
    let roleId: string | null = null;
    if (payload.roleId) {
      const roleDoc = await this.roleRepository.findById(payload.roleId);
      if (roleDoc) {
        role = roleDoc.name;
        roleId = payload.roleId;
      }
    }

    const plainPassword = randomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);

    const phone = payload.phone?.trim();
    const squareId = payload.squareId?.trim();
    const homebaseData = payload.homebaseData;
    const profileImagePublicId = payload.profileImagePublicId?.trim();
    const startDate = payload.startDate != null ? new Date(payload.startDate) : undefined;
    const doc = await this.userRepository.create({
      email: payload.email.trim().toLowerCase(),
      password: hashedPassword,
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      role,
      roleId,
      isActive: true,
      status: "pending",
      ...(phone !== undefined && phone !== "" && { phone }),
      ...(squareId !== undefined && squareId !== "" && { squareId }),
      ...((homebaseData?.id ?? "") !== "" && homebaseData != null && { homebaseData }),
      ...(profileImagePublicId !== undefined &&
        profileImagePublicId !== "" && { profileImagePublicId }),
      ...(startDate !== undefined && { startDate }),
    });

    if (options?.sendInvite) {
      const token = crypto.randomBytes(32).toString("hex");
      const invitationTokenExpiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      );
      const base = (
        process.env.CLIENT_URL ??
        process.env.APP_URL ??
        process.env.FRONTEND_URL ??
        ""
      )
        .trim()
        .replace(/\/$/, "");
      const setPasswordUrl = base
        ? `${base}/set-password?token=${token}`
        : `/set-password?token=${token}`;
      await this.userRepository.updateById(doc._id.toString(), {
        invitationToken: token,
        invitationTokenExpiresAt,
        invitationSentAt: new Date(),
      });
      await sendInvitationEmail({
        to: doc.email,
        firstName: doc.firstName,
        setPasswordUrl,
      });
    }

    const finalDoc = options?.sendInvite
      ? await this.userRepository.findById(doc._id.toString())
      : doc;

    const reviewCycleService = new ReviewCycleService();
    const cycleResult = await reviewCycleService.startCycleForUser(doc._id.toString()).catch((err) => {
      logger.warn("Review cycle start after create failed", { userId: doc._id.toString(), err });
      return { started: false as const, message: err instanceof Error ? err.message : String(err) };
    });
    if (!cycleResult.started && cycleResult.message) {
      logger.info("Review cycle not started after create", { userId: doc._id.toString(), reason: cycleResult.message });
    }

    return toIUser(finalDoc ?? doc);
  }

  /** Legacy: create user with full data (e.g. seed scripts). */
  async createUserRaw(
    userData: Omit<IUser, "_id" | "createdAt" | "updatedAt">,
  ): Promise<IUser> {
    const doc = await this.userRepository.create(userData);
    return toIUser(doc);
  }

  async getUserById(id: string): Promise<IUser | null> {
    const doc = await this.userRepository.findById(id);
    if (!doc) return null;
    return toIUser(doc);
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    const doc = await this.userRepository.findByEmail(email);
    return doc ? toIUser(doc) : null;
  }

  async getAllUsers(): Promise<IUser[]> {
    const docs = await this.userRepository.findAll();
    return docs.map(toIUser);
  }

  async getUsers(filters?: {
    search?: string;
    roleId?: string;
    roleIds?: string[];
    excludeUserIds?: string[];
    locationId?: string;
    showArchived?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{
    users: IUser[];
    totalItems: number;
    totalPages: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 10));

    if (!filters?.locationId || filters.locationId.trim() === "") {
      const filterParams: { search?: string; roleId?: string; roleIds?: string[]; excludeUserIds?: string[]; showArchived?: boolean } = {};
      if (filters?.search !== undefined && filters.search !== "")
        filterParams.search = filters.search;
      if (filters?.roleIds && filters.roleIds.length > 0)
        filterParams.roleIds = filters.roleIds;
      else if (filters?.roleId !== undefined && filters.roleId !== "")
        filterParams.roleId = filters.roleId;
      if (filters?.excludeUserIds && filters.excludeUserIds.length > 0)
        filterParams.excludeUserIds = filters.excludeUserIds;
      filterParams.showArchived = filters?.showArchived ?? false;
      const { docs, total } =
        await this.userRepository.findWithFiltersPaginated(filterParams, {
          page,
          pageSize,
        });
      return {
        users: docs.map(toIUser),
        totalItems: total,
        totalPages: Math.ceil(total / pageSize) || 1,
        page,
        pageSize,
      };
    }

    const listFilterParams: { search?: string; roleId?: string; roleIds?: string[]; excludeUserIds?: string[]; showArchived?: boolean } = {};
    if (filters?.search !== undefined && filters.search !== "")
      listFilterParams.search = filters.search;
    if (filters?.roleIds && filters.roleIds.length > 0)
      listFilterParams.roleIds = filters.roleIds;
    else if (filters?.roleId !== undefined && filters.roleId !== "")
      listFilterParams.roleId = filters.roleId;
    if (filters?.excludeUserIds && filters.excludeUserIds.length > 0)
      listFilterParams.excludeUserIds = filters.excludeUserIds;
    listFilterParams.showArchived = filters?.showArchived ?? false;
    const docs = await this.userRepository.findWithFilters(listFilterParams);
    const locationId = filters.locationId.trim();
    const roleIdStrings = [
      ...new Set(
        docs
          .map((d) => d.roleId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const roleMap = new Map<
      string,
      { locationAccess: string; locationIdStrings: string[] }
    >();
    for (const rid of roleIdStrings) {
      const role = await this.roleRepository.findById(rid);
      if (role) {
        const locationAccess = (
          (role as { locationAccess?: string }).locationAccess ?? "all"
        ).toLowerCase();
        const locationIdStrings = roleLocationIdStrings(
          role as { locationIds?: unknown[] },
        );
        roleMap.set(rid, { locationAccess, locationIdStrings });
      }
    }

    // Include users whose effective locations (role ∪ overrides \ removals) include the selected location,
    // and also include users with no role (e.g. synced-from-Homebase) so they appear in the list and can be assigned a role.
    const filtered = docs.filter((doc) => {
      if (!doc.roleId) return true;
      const rid = String(doc.roleId);
      const r = roleMap.get(rid);
      if (!r) return false;
      const docWithOverrides = doc as UserDocument & {
        locationOverrides?: unknown[];
        locationRemovals?: unknown[];
      };
      return userHasAccessToLocation(
        r.locationAccess,
        r.locationIdStrings,
        locationId,
        docWithOverrides.locationOverrides,
        docWithOverrides.locationRemovals,
      );
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return {
      users: paginated.map(toIUser),
      totalItems: total,
      totalPages: Math.ceil(total / pageSize) || 1,
      page,
      pageSize,
    };
  }

  /**
   * Returns user IDs that have access to the given location (same role/location logic as getUsers).
   * Used by training assignment list to filter assignments by navbar location.
   */
  async getUserIdsWithAccessToLocation(locationId: string): Promise<string[]> {
    if (!locationId || locationId.trim() === "") return [];
    const docs = await this.userRepository.findWithFilters({});
    const locId = locationId.trim();
    const roleIdStrings = [
      ...new Set(
        docs
          .map((d) => d.roleId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const roleMap = new Map<
      string,
      { locationAccess: string; locationIdStrings: string[] }
    >();
    for (const rid of roleIdStrings) {
      const role = await this.roleRepository.findById(rid);
      if (role) {
        const locationAccess = (
          (role as { locationAccess?: string }).locationAccess ?? "all"
        ).toLowerCase();
        const locationIdStrings = roleLocationIdStrings(
          role as { locationIds?: unknown[] },
        );
        roleMap.set(rid, { locationAccess, locationIdStrings });
      }
    }
    const filtered = docs.filter((doc) => {
      if (!doc.roleId) return false;
      const rid = String(doc.roleId);
      const r = roleMap.get(rid);
      if (!r) return false;
      const docWithOverrides = doc as UserDocument & {
        locationOverrides?: unknown[];
        locationRemovals?: unknown[];
      };
      return userHasAccessToLocation(
        r.locationAccess,
        r.locationIdStrings,
        locId,
        docWithOverrides.locationOverrides,
        docWithOverrides.locationRemovals,
      );
    });
    return filtered.map((d) => toIdString(d._id) ?? "").filter(Boolean);
  }

  async updateUser(
    id: string,
    updateData: Partial<IUser>,
  ): Promise<IUser | null> {
    const current = await this.userRepository.findById(id);
    if (current != null) {
      await this.ensureNotLastOwner(
        current.role,
        updateData.role,
        updateData.isActive,
      );
    }
    const payload = { ...updateData };
    if (payload.roleId !== undefined) {
      if (payload.roleId == null || payload.roleId === "") {
        payload.role = null;
        payload.roleId = null;
      } else {
        const roleDoc = await this.roleRepository.findById(payload.roleId);
        if (roleDoc) {
          payload.role = roleDoc.name;
        }
      }
    }
    const oldProfileImagePublicId =
      current?.profileImagePublicId != null &&
      String(current.profileImagePublicId).trim() !== ""
        ? String(current.profileImagePublicId).trim()
        : null;
    const doc = await this.userRepository.updateById(id, payload);
    if (
      doc &&
      oldProfileImagePublicId &&
      payload.profileImagePublicId !== undefined
    ) {
      deleteFromCloudinary(oldProfileImagePublicId).catch(() => {});
    }
    return doc ? toIUser(doc) : null;
  }

  async deleteUser(id: string): Promise<boolean> {
    const current = await this.userRepository.findById(id);
    if (current?.role === OWNER_ROLE_NAME) {
      const owners = await this.userRepository.findByRole(OWNER_ROLE_NAME);
      if (owners.length <= 1) {
        throw new ForbiddenError(
          "Cannot delete the last user with the Owner role.",
        );
      }
    }
    return await this.userRepository.deleteById(id);
  }

  async resendInvite(userId: string): Promise<IUser | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) return null;
    if (user.status !== "pending") {
      throw new ForbiddenError(
        "Resend invitation is only allowed for users with pending status.",
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const invitationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.userRepository.updateById(userId, {
      invitationToken: token,
      invitationTokenExpiresAt,
      invitationSentAt: new Date(),
    });

    const base = (
      process.env.CLIENT_URL ??
      process.env.APP_URL ??
      process.env.FRONTEND_URL ??
      ""
    )
      .trim()
      .replace(/\/$/, "");
    const setPasswordUrl = base
      ? `${base}/set-password?token=${token}`
      : `/set-password?token=${token}`;
    await sendInvitationEmail({
      to: user.email,
      firstName: user.firstName,
      setPasswordUrl,
    });

    const updated = await this.userRepository.findById(userId);
    return updated ? toIUser(updated) : null;
  }

  async syncFromSquare(locationId: string): Promise<SyncFromSquareResult> {
    const withCreds =
      await this.locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, squareAccessToken } = withCreds;
    const squareLocationId = location.squareLocationId?.trim();
    if (!squareLocationId || !squareAccessToken) {
      throw new ForbiddenError(
        "Location does not have Square credentials configured.",
      );
    }

    const members = await searchTeamMembers(squareLocationId, {
      accessToken: squareAccessToken,
    });

    const result: SyncFromSquareResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (const tm of members) {
      const normalized = normalizeTeamMember(tm);
      if (!normalized) {
        result.skipped++;
        continue;
      }

      try {
        const existing = await this.resolveExistingUser(normalized);
        if (existing) {
          const updatePayload = buildSyncUpdatePayload(normalized, existing);
          await this.userRepository.updateById(
            existing._id.toString(),
            updatePayload,
          );
          result.updated++;
        } else {
          const hashedPassword = await bcrypt.hash(
            randomPassword(),
            SALT_ROUNDS,
          );
          await this.userRepository.create(
            buildSyncCreatePayload(normalized, hashedPassword),
          );
          result.created++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${normalized.email}: ${msg}`);
      }
    }

    return result;
  }

  async syncFromHomebase(locationId: string): Promise<SyncFromHomebaseResult> {
    const withCreds =
      await this.locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError("Location not found");
    }
    const { location, homebaseApiKey } = withCreds;
    const homebaseLocationId = location.homebaseLocationId?.trim();
    if (!homebaseLocationId || !homebaseApiKey) {
      throw new ForbiddenError(
        "Location does not have Homebase credentials configured.",
      );
    }

    const employees = await getEmployeesForLocation(
      homebaseLocationId,
      homebaseApiKey,
    );

    const result: SyncFromHomebaseResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (const emp of employees) {
      const normalized = normalizeHomebaseEmployee(emp);
      if (!normalized) {
        result.skipped++;
        continue;
      }

      try {
        const existing = await this.resolveExistingUserForHomebase(normalized);
        if (existing) {
          const updatePayload = buildHomebaseSyncUpdatePayload(
            normalized,
            existing,
          );
          await this.userRepository.updateById(
            existing._id.toString(),
            updatePayload,
          );
          result.updated++;
          const reviewCycleService = new ReviewCycleService();
          await reviewCycleService.startCycleForUser(existing._id.toString()).catch((err) => {
            logger.warn("Review cycle start after Homebase update failed", { userId: existing._id.toString(), err });
          });
        } else {
          const hashedPassword = await bcrypt.hash(
            randomPassword(),
            SALT_ROUNDS,
          );
          const created = await this.userRepository.create(
            buildHomebaseSyncCreatePayload(normalized, hashedPassword),
          );
          result.created++;
          if (created.isTerminated !== true) {
            const reviewCycleService = new ReviewCycleService();
            await reviewCycleService.startCycleForUser(created._id.toString()).catch((err) => {
              logger.warn("Review cycle start after Homebase create failed", { userId: created._id.toString(), err });
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${normalized.email}: ${msg}`);
      }
    }

    return result;
  }

  /** Find existing user by squareId or email; returns null if none. */
  private async resolveExistingUser(normalized: {
    email: string;
    squareId?: string | undefined;
  }): Promise<UserDocument | null> {
    const existingBySquare =
      normalized.squareId != null && normalized.squareId !== ""
        ? await this.userRepository.findBySquareId(normalized.squareId)
        : null;
    const existingByEmail =
      await this.userRepository.findByEmail(normalized.email);
    return existingBySquare ?? existingByEmail ?? null;
  }

  /** Find existing user by homebaseData.id or email; returns null if none. */
  private async resolveExistingUserForHomebase(normalized: {
    email: string;
    homebaseData: { id: string };
  }): Promise<UserDocument | null> {
    const existingByHomebase = await this.userRepository.findByHomebaseId(
      normalized.homebaseData.id,
    );
    const existingByEmail =
      await this.userRepository.findByEmail(normalized.email);
    return existingByHomebase ?? existingByEmail ?? null;
  }

  async terminateUser(id: string): Promise<IUser | null> {
    const doc = await this.userRepository.updateById(id, { isTerminated: true });
    if (!doc) return null;

    const TERMINAL_STATUSES = ["cycle_complete", "checkin_60_complete", "checkin_60_done"];
    await ReviewCycleModel.updateMany(
      { employeeId: id, status: { $nin: TERMINAL_STATUSES } },
      { $set: { status: "cycle_complete" as const } },
    );

    return toIUser(doc);
  }
}

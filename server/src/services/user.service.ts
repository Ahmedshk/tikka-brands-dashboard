import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserRepository } from '../repositories/user.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { LocationService } from './location.service.js';
import { UserDocument } from '../models/user.model.js';
import { IUser, UserRole } from '../types/user.types.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.util.js';
import { sendInvitationEmail } from './mailer.service.js';
import { searchTeamMembers } from './square.service.js';
import { deleteFromCloudinary } from '../config/cloudinary.js';

const OWNER_ROLE_NAME = UserRole.OWNER;
const SALT_ROUNDS = 10;

function randomPassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let s = '';
  for (let i = 0; i < length; i++) s += chars[bytes[i]! % chars.length];
  return s;
}

function toIUser(doc: UserDocument): IUser {
  const plain =
    doc && typeof (doc as UserDocument & { toObject?: () => Record<string, unknown> }).toObject === 'function'
      ? (doc as UserDocument & { toObject: () => Record<string, unknown> }).toObject()
      : { ...doc };
  const { _id, ...rest } = plain;
  return { ...rest, _id: _id != null ? String(_id) : undefined } as IUser;
}

/** Extract location id strings from a role's locationIds (populated or raw ObjectIds). */
function roleLocationIdStrings(role: { locationIds?: unknown[] }): string[] {
  const locationIds = role?.locationIds ?? [];
  return locationIds
    .map((l) => {
      if (l == null) return '';
      if (typeof l === 'object' && l !== null && '_id' in l)
        return String((l as { _id: unknown })._id);
      return String(l);
    })
    .filter(Boolean);
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  squareId?: string;
  homebaseId?: string;
  roleId?: string | null;
  profileImagePublicId?: string | null;
}

export interface SyncFromSquareResult {
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
    userId: string,
    currentRole: string | null,
    newRole?: string | null,
    newIsActive?: boolean
  ): Promise<void> {
    const isCurrentlyOwner = currentRole === OWNER_ROLE_NAME;
    const wouldLeaveOwnerRole = newRole !== undefined && newRole !== OWNER_ROLE_NAME;
    const wouldDeactivate = newIsActive === false;
    if (!isCurrentlyOwner) return;
    if (!wouldLeaveOwnerRole && !wouldDeactivate) return;

    const owners = await this.userRepository.findByRole(OWNER_ROLE_NAME);
    const ownerCount = owners.length;
    if (ownerCount <= 1) {
      throw new ForbiddenError(
        'Cannot remove or deactivate the last user with the Owner role.'
      );
    }
  }

  async createUser(
    payload: CreateUserPayload,
    options?: { sendInvite?: boolean }
  ): Promise<IUser> {
    const existing = await this.userRepository.findByEmail(payload.email);
    if (existing) {
      throw new ConflictError('A user with this email already exists.');
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

    const doc = await this.userRepository.create({
      email: payload.email.trim().toLowerCase(),
      password: hashedPassword,
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      role,
      roleId: roleId ?? undefined,
      isActive: true,
      status: 'pending',
      phone: payload.phone?.trim() || undefined,
      squareId: payload.squareId?.trim() || undefined,
      homebaseId: payload.homebaseId?.trim() || undefined,
      profileImagePublicId: payload.profileImagePublicId?.trim() || undefined,
    });

    if (options?.sendInvite) {
      const token = crypto.randomBytes(32).toString('hex');
      const invitationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const base = (process.env.CLIENT_URL ?? process.env.APP_URL ?? process.env.FRONTEND_URL ?? '').trim().replace(/\/$/, '');
      const setPasswordUrl = base ? `${base}/set-password?token=${token}` : `/set-password?token=${token}`;
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
    return toIUser(finalDoc ?? doc);
  }

  /** Legacy: create user with full data (e.g. seed scripts). */
  async createUserRaw(userData: Omit<IUser, '_id' | 'createdAt' | 'updatedAt'>): Promise<IUser> {
    const doc = await this.userRepository.create(userData);
    return toIUser(doc);
  }

  async getUserById(id: string): Promise<IUser | null> {
    const doc = await this.userRepository.findById(id);
    if (!doc) return null;
    const plain = doc.toObject() as Record<string, unknown> & { _id: unknown };
    return toIUser({ ...plain, _id: doc._id } as UserDocument);
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
    locationId?: string;
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

    if (!filters?.locationId || filters.locationId.trim() === '') {
      const { docs, total } = await this.userRepository.findWithFiltersPaginated(
        { search: filters?.search, roleId: filters?.roleId },
        { page, pageSize }
      );
      return {
        users: docs.map(toIUser),
        totalItems: total,
        totalPages: Math.ceil(total / pageSize) || 1,
        page,
        pageSize,
      };
    }

    const docs = await this.userRepository.findWithFilters({
      search: filters?.search,
      roleId: filters?.roleId,
    });
    const locationId = filters.locationId.trim();
    const roleIdStrings = [...new Set(
      docs.map((d) => d.roleId).filter(Boolean).map((id) => String(id))
    )];
    const roleMap = new Map<string, { locationAccess: string; locationIdStrings: string[] }>();
    for (const rid of roleIdStrings) {
      const role = await this.roleRepository.findById(rid);
      if (role) {
        const locationAccess = ((role as { locationAccess?: string }).locationAccess ?? 'all').toLowerCase();
        const locationIdStrings = roleLocationIdStrings(role as { locationIds?: unknown[] });
        roleMap.set(rid, { locationAccess, locationIdStrings });
      }
    }

    // Include users whose assigned role has access to the selected location (role "all" = access to every location)
    const filtered = docs.filter((doc) => {
      if (!doc.roleId) return false;
      const rid = String(doc.roleId);
      const r = roleMap.get(rid);
      if (!r) return false;
      if (r.locationAccess === 'all') return true;
      return r.locationIdStrings.includes(locationId);
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

  async updateUser(id: string, updateData: Partial<IUser>): Promise<IUser | null> {
    const current = await this.userRepository.findById(id);
    if (current != null) {
      await this.ensureNotLastOwner(
        id,
        current.role,
        updateData.role,
        updateData.isActive
      );
    }
    const payload = { ...updateData };
    if (payload.roleId !== undefined) {
      if (payload.roleId == null || payload.roleId === '') {
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
      current?.profileImagePublicId != null && String(current.profileImagePublicId).trim() !== ''
        ? String(current.profileImagePublicId).trim()
        : null;
    const doc = await this.userRepository.updateById(id, payload);
    if (doc && oldProfileImagePublicId && payload.profileImagePublicId !== undefined) {
      deleteFromCloudinary(oldProfileImagePublicId).catch(() => {});
    }
    return doc ? toIUser(doc) : null;
  }

  async deleteUser(id: string): Promise<boolean> {
    const current = await this.userRepository.findById(id);
    if (current && current.role === OWNER_ROLE_NAME) {
      const owners = await this.userRepository.findByRole(OWNER_ROLE_NAME);
      if (owners.length <= 1) {
        throw new ForbiddenError(
          'Cannot delete the last user with the Owner role.'
        );
      }
    }
    return await this.userRepository.deleteById(id);
  }

  async resendInvite(userId: string): Promise<IUser | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) return null;
    if (user.status !== 'pending') {
      throw new ForbiddenError('Resend invitation is only allowed for users with pending status.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const invitationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.userRepository.updateById(userId, {
      invitationToken: token,
      invitationTokenExpiresAt,
      invitationSentAt: new Date(),
    });

    const base = (process.env.CLIENT_URL ?? process.env.APP_URL ?? process.env.FRONTEND_URL ?? '').trim().replace(/\/$/, '');
    const setPasswordUrl = base ? `${base}/set-password?token=${token}` : `/set-password?token=${token}`;
    await sendInvitationEmail({
      to: user.email,
      firstName: user.firstName,
      setPasswordUrl,
    });

    const updated = await this.userRepository.findById(userId);
    return updated ? toIUser(updated) : null;
  }

  async syncFromSquare(locationId: string): Promise<SyncFromSquareResult> {
    const withCreds = await this.locationService.getByIdWithCredentials(locationId);
    if (!withCreds) {
      throw new NotFoundError('Location not found');
    }
    const { location, squareAccessToken } = withCreds;
    const squareLocationId = location.squareLocationId?.trim();
    if (!squareLocationId || !squareAccessToken) {
      throw new ForbiddenError('Location does not have Square credentials configured.');
    }

    const members = await searchTeamMembers(squareLocationId, {
      accessToken: squareAccessToken,
    });

    const result: SyncFromSquareResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const tm of members) {
      const email = (tm.email_address ?? '').trim().toLowerCase();
      if (!email) {
        result.skipped++;
        continue;
      }
      const firstName = (tm.given_name ?? '').trim() || 'Unknown';
      const lastName = (tm.family_name ?? '').trim() || 'Unknown';
      const phone = tm.phone_number?.trim() || undefined;
      const squareId = tm.id?.trim() || undefined;

      try {
        const existingBySquare = squareId ? await this.userRepository.findBySquareId(squareId) : null;
        const existingByEmail = await this.userRepository.findByEmail(email);
        const existing = existingBySquare ?? existingByEmail ?? null;

        if (existing) {
          await this.userRepository.updateById(existing._id.toString(), {
            firstName,
            lastName,
            phone: phone ?? existing.phone,
            squareId: squareId ?? existing.squareId,
          });
          result.updated++;
        } else {
          const plainPassword = randomPassword();
          const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);
          await this.userRepository.create({
            email,
            password: hashedPassword,
            firstName,
            lastName,
            role: null,
            roleId: undefined,
            isActive: true,
            status: 'pending',
            phone,
            squareId,
          });
          result.created++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${email}: ${msg}`);
      }
    }

    return result;
  }
}

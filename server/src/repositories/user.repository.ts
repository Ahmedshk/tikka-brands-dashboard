import { Types } from 'mongoose';
import { UserModel, UserDocument } from '../models/user.model.js';
import { IUser } from '../types/user.types.js';

export class UserRepository {
  async create(userData: Omit<IUser, '_id' | 'createdAt' | 'updatedAt'>): Promise<UserDocument> {
    const user = new UserModel(userData);
    return await user.save();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return await UserModel.findById(id).lean().exec() as UserDocument | null;
  }

  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = UserModel.findOne({ email: email.toLowerCase() });
    if (includePassword) {
      return await query.select('+password').lean().exec() as UserDocument | null;
    }
    return await query.lean().exec() as UserDocument | null;
  }

  async findAll(): Promise<UserDocument[]> {
    return await UserModel.find().lean().exec();
  }

  async findWithFilters(filters: {
    search?: string;
    roleId?: string;
    roleIds?: string[];
    excludeUserIds?: string[];
    showArchived?: boolean;
  }): Promise<UserDocument[]> {
    const query = this.buildListQuery(filters);
    return await UserModel.find(query).sort({ createdAt: -1 }).lean().exec();
  }

  /** Paginated list with same filters; returns docs and total count. */
  async findWithFiltersPaginated(
    filters: { search?: string; roleId?: string; roleIds?: string[]; excludeUserIds?: string[]; showArchived?: boolean },
    options: { page: number; pageSize: number }
  ): Promise<{ docs: UserDocument[]; total: number }> {
    const query = this.buildListQuery(filters);
    const [docs, total] = await Promise.all([
      UserModel.find(query)
        .sort({ createdAt: -1 })
        .skip((options.page - 1) * options.pageSize)
        .limit(options.pageSize)
        .lean()
        .exec(),
      UserModel.countDocuments(query),
    ]);
    return { docs, total };
  }

  private buildListQuery(filters: { search?: string; roleId?: string; roleIds?: string[]; excludeUserIds?: string[]; showArchived?: boolean }): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    if (filters.roleIds && filters.roleIds.length > 0) {
      query.roleId = { $in: filters.roleIds };
    } else if (filters.roleId) {
      query.roleId = filters.roleId;
    }
    if (filters.excludeUserIds && filters.excludeUserIds.length > 0) {
      query._id = { $nin: filters.excludeUserIds.map((id) => new Types.ObjectId(id)) };
    }
    if (!filters.showArchived) {
      query['homebaseData.job.archived_at'] = { $in: [null, undefined] };
    }
    const searchTerm = filters.search?.trim();
    if (searchTerm) {
      const term = searchTerm.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
      const regex = new RegExp(term, 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
      ];
    }
    return query;
  }

  async updateById(id: string, updateData: Partial<IUser>): Promise<UserDocument | null> {
    return await UserModel.findByIdAndUpdate(id, updateData, { new: true }).lean().exec() as UserDocument | null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await UserModel.findByIdAndDelete(id);
    return result !== null;
  }

  async findByRole(role: string): Promise<UserDocument[]> {
    return await UserModel.find({ role }).lean().exec() as UserDocument[];
  }

  async findBySquareId(squareId: string): Promise<UserDocument | null> {
    return await UserModel.findOne({ squareId: squareId.trim() }).lean().exec() as UserDocument | null;
  }

  async findByHomebaseId(homebaseId: string): Promise<UserDocument | null> {
    return await UserModel.findOne({ "homebaseData.id": homebaseId.trim() }).lean().exec() as UserDocument | null;
  }

  async findByInvitationToken(token: string): Promise<UserDocument | null> {
    if (!token?.trim()) return null;
    return await UserModel.findOne({ invitationToken: token.trim() }).lean().exec() as UserDocument | null;
  }

  async setPasswordAndClearInvitationToken(
    id: string,
    hashedPassword: string
  ): Promise<UserDocument | null> {
    return await UserModel.findByIdAndUpdate(
      id,
      {
        $set: { password: hashedPassword },
        $unset: { invitationToken: 1, invitationTokenExpiresAt: 1 },
      },
      { new: true }
    ).lean().exec() as UserDocument | null;
  }
}

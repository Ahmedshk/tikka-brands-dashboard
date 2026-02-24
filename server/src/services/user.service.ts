import { UserRepository } from '../repositories/user.repository.js';
import { UserDocument } from '../models/user.model.js';
import { IUser, UserRole } from '../types/user.types.js';
import { ForbiddenError } from '../utils/errors.util.js';

const OWNER_ROLE_NAME = UserRole.OWNER;

function toIUser(doc: UserDocument): IUser {
  const { _id, ...rest } = doc;
  return { ...rest, _id: _id.toString() } as IUser;
}

export class UserService {
  private readonly userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /** Throws if removing or deactivating the last user with Owner role. */
  private async ensureNotLastOwner(
    userId: string,
    currentRole: string,
    newRole?: string,
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

  async createUser(userData: Omit<IUser, '_id' | 'createdAt' | 'updatedAt'>): Promise<IUser> {
    const doc = await this.userRepository.create(userData);
    return toIUser(doc);
  }

  async getUserById(id: string): Promise<IUser | null> {
    const doc = await this.userRepository.findById(id);
    return doc ? toIUser(doc) : null;
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    const doc = await this.userRepository.findByEmail(email);
    return doc ? toIUser(doc) : null;
  }

  async getAllUsers(): Promise<IUser[]> {
    const docs = await this.userRepository.findAll();
    return docs.map(toIUser);
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
    const doc = await this.userRepository.updateById(id, updateData);
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
}

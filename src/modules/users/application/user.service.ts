import { IUserRepository, UpdateUserData } from '../domain/user.repository.interface.js';
import { UserProfile, toUserProfile } from '../domain/user.entity.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export class UserService {
  constructor(private readonly userRepository: IUserRepository) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserProfile(user);
  }

  async updateProfile(userId: string, data: UpdateUserData): Promise<UserProfile> {
    const existing = await this.userRepository.findById(userId);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    const updated = await this.userRepository.update(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
    });

    return toUserProfile(updated);
  }

  async getUserById(id: string): Promise<UserProfile> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserProfile(user);
  }

  async listUsers(params: PaginationParams): Promise<PaginatedResult<UserProfile>> {
    const paginated = await this.userRepository.findAll(params);
    return {
      ...paginated,
      items: paginated.items.map((u) => toUserProfile(u)),
    };
  }
}

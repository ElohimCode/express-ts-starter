import { IUserRepository, UpdateUserData } from '../domain/user.repository.interface.js';
import { UserProfile, toUserProfile } from '../domain/user.entity.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export interface UserServiceDependencies {
  userRepository: IUserRepository;
}

export interface UserService {
  getProfile(userId: string): Promise<UserProfile>;
  updateProfile(userId: string, data: UpdateUserData): Promise<UserProfile>;
  getUserById(id: string): Promise<UserProfile>;
  listUsers(params: PaginationParams): Promise<PaginatedResult<UserProfile>>;
}

export function createUserService(dependencies: UserServiceDependencies): UserService {
  const { userRepository } = dependencies;

  async function getProfile(userId: string): Promise<UserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserProfile(user);
  }

  async function updateProfile(userId: string, data: UpdateUserData): Promise<UserProfile> {
    const existing = await userRepository.findById(userId);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    const updated = await userRepository.update(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
    });

    return toUserProfile(updated);
  }

  async function getUserById(id: string): Promise<UserProfile> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserProfile(user);
  }

  async function listUsers(params: PaginationParams): Promise<PaginatedResult<UserProfile>> {
    const paginated = await userRepository.findAll(params);
    return {
      ...paginated,
      items: paginated.items.map((u) => toUserProfile(u)),
    };
  }

  return {
    getProfile,
    updateProfile,
    getUserById,
    listUsers,
  };
}

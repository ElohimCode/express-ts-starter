import { UserEntity } from './user.entity.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: 'USER' | 'ADMIN';
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  create(data: CreateUserData): Promise<UserEntity>;
  update(id: string, data: UpdateUserData): Promise<UserEntity>;
  findAll(params: PaginationParams): Promise<PaginatedResult<UserEntity>>;
  count(): Promise<number>;
}

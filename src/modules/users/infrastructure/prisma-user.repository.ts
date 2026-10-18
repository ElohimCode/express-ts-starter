import { PrismaClient, User as PrismaUser } from '@prisma/client';
import {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
} from '../domain/user.repository.interface.js';
import { UserEntity } from '../domain/user.entity.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export function createPrismaUserRepository(prisma: PrismaClient): IUserRepository {
  function mapToEntity(user: PrismaUser): UserEntity {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async function findById(id: string): Promise<UserEntity | null> {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    return user ? mapToEntity(user) : null;
  }

  async function findByEmail(email: string): Promise<UserEntity | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    return user ? mapToEntity(user) : null;
  }

  async function create(data: CreateUserData): Promise<UserEntity> {
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash: data.passwordHash,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        role: data.role || 'USER',
      },
    });
    return mapToEntity(user);
  }

  async function update(id: string, data: UpdateUserData): Promise<UserEntity> {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return mapToEntity(user);
  }

  async function findAll(params: PaginationParams): Promise<PaginatedResult<UserEntity>> {
    const page = Math.max(1, params.page);
    const limit = Math.max(1, Math.min(100, params.limit));
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: users.map(mapToEntity),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async function count(): Promise<number> {
    return prisma.user.count();
  }

  return {
    findById,
    findByEmail,
    create,
    update,
    findAll,
    count,
  };
}

// Preserve class alias for backwards compatibility if needed
export class PrismaUserRepository {
  private repo: IUserRepository;
  constructor(prisma: PrismaClient) {
    this.repo = createPrismaUserRepository(prisma);
  }
  findById(id: string) {
    return this.repo.findById(id);
  }
  findByEmail(email: string) {
    return this.repo.findByEmail(email);
  }
  create(data: CreateUserData) {
    return this.repo.create(data);
  }
  update(id: string, data: UpdateUserData) {
    return this.repo.update(id, data);
  }
  findAll(params: PaginationParams) {
    return this.repo.findAll(params);
  }
  count() {
    return this.repo.count();
  }
}

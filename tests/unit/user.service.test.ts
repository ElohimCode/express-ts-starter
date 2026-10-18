import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createUserService,
  UserService,
} from '../../src/modules/users/application/user.service.js';
import { IUserRepository } from '../../src/modules/users/domain/user.repository.interface.js';
import { NotFoundError } from '../../src/shared/errors/app-error.js';

describe('UserService (Unit)', () => {
  let userService: UserService;
  let mockUserRepo: IUserRepository;

  beforeEach(() => {
    mockUserRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
    };

    userService = createUserService({ userRepository: mockUserRepo });
  });

  describe('getProfile', () => {
    it('returns user profile without passwordHash', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'secret_hash',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const profile = await userService.getProfile('u1');

      expect(profile.id).toBe('u1');
      expect(profile.email).toBe('test@example.com');
      expect(profile).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundError when user does not exist', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue(null);

      await expect(userService.getProfile('unknown')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('updates allowed user fields', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'secret',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(mockUserRepo.update).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'secret',
        firstName: 'Johnny',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updated = await userService.updateProfile('u1', { firstName: 'Johnny' });
      expect(updated.firstName).toBe('Johnny');
      expect(mockUserRepo.update).toHaveBeenCalledWith('u1', {
        firstName: 'Johnny',
        lastName: undefined,
      });
    });
  });
});

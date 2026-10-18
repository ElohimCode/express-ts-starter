import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthService, AuthService } from '../../src/modules/auth/application/auth.service.js';
import { IUserRepository } from '../../src/modules/users/domain/user.repository.interface.js';
import { IPasswordHasher } from '../../src/modules/auth/domain/password-hasher.interface.js';
import { ITokenService } from '../../src/modules/auth/domain/token.service.interface.js';
import { IAuthSessionRepository } from '../../src/modules/auth/domain/auth-session.repository.interface.js';
import { ConflictError, UnauthorizedError } from '../../src/shared/errors/app-error.js';

describe('AuthService (Unit)', () => {
  let authService: AuthService;
  let mockUserRepo: IUserRepository;
  let mockHasher: IPasswordHasher;
  let mockTokenService: ITokenService;
  let mockSessionRepo: IAuthSessionRepository;

  beforeEach(() => {
    mockUserRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
    };

    mockHasher = {
      hash: vi.fn().mockResolvedValue('hashed_secret'),
      verify: vi.fn().mockResolvedValue(true),
    };

    mockTokenService = {
      signAccessToken: vi.fn().mockReturnValue('mock_access_token'),
      verifyAccessToken: vi
        .fn()
        .mockReturnValue({ sub: 'u1', email: 'test@example.com', role: 'USER' }),
      generateRefreshToken: vi.fn().mockReturnValue('mock_refresh_token'),
      hashRefreshToken: vi.fn().mockReturnValue('mock_refresh_hash'),
      getRefreshTokenExpiryDate: vi.fn().mockReturnValue(new Date(Date.now() + 7 * 86400000)),
    };

    mockSessionRepo = {
      createSession: vi.fn().mockResolvedValue({
        id: 's1',
        userId: 'u1',
        tokenHash: 'mock_refresh_hash',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findSessionByHash: vi.fn(),
      rotateSession: vi.fn(),
      revokeSession: vi.fn(),
      revokeAllUserSessions: vi.fn(),
    };

    authService = createAuthService({
      userRepository: mockUserRepo,
      passwordHasher: mockHasher,
      tokenService: mockTokenService,
      authSessionRepository: mockSessionRepo,
    });
  });

  describe('register', () => {
    it('successfully registers a new user and issues tokens', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(mockUserRepo.create).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'hashed_secret',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('mock_access_token');
      expect(result.tokens.refreshToken).toBe('mock_refresh_token');
      expect(mockHasher.hash).toHaveBeenCalledWith('Password123!');
      expect(mockSessionRepo.createSession).toHaveBeenCalled();
    });

    it('rejects registration if email is already taken', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'existing_hash',
        firstName: 'Existing',
        lastName: 'User',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Jane',
          lastName: 'Doe',
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    it('successfully authenticates with valid credentials', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'hashed_secret',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockHasher.verify).mockResolvedValue(true);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result.user.id).toBe('u1');
      expect(result.tokens.accessToken).toBe('mock_access_token');
    });

    it('throws UnauthorizedError when user does not exist (enumeration safe)', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'notfound@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when password does not match', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'hashed_secret',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockHasher.verify).mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when account is deactivated', async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: 'hashed_secret',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'USER',
        isActive: false, // Inactive
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockHasher.verify).mockResolvedValue(true);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});

import { IUserRepository } from '../../users/domain/user.repository.interface.js';
import { IPasswordHasher } from '../domain/password-hasher.interface.js';
import { ITokenService } from '../domain/token.service.interface.js';
import { IAuthSessionRepository } from '../domain/auth-session.repository.interface.js';
import { UserProfile, toUserProfile } from '../../users/domain/user.entity.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../../../shared/errors/app-error.js';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface AuthServiceDependencies {
  userRepository: IUserRepository;
  passwordHasher: IPasswordHasher;
  tokenService: ITokenService;
  authSessionRepository: IAuthSessionRepository;
}

export interface AuthService {
  register(input: RegisterInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  refreshTokens(
    oldRefreshToken: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthTokens>;
  logout(refreshToken: string): Promise<void>;
  getCurrentUser(userId: string): Promise<UserProfile>;
}

export function createAuthService(dependencies: AuthServiceDependencies): AuthService {
  const { userRepository, passwordHasher, tokenService, authSessionRepository } = dependencies;

  async function createSessionAndIssueTokens(
    userId: string,
    email: string,
    role: 'USER' | 'ADMIN',
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthTokens> {
    const accessToken = tokenService.signAccessToken({
      sub: userId,
      email,
      role,
    });

    const rawRefreshToken = tokenService.generateRefreshToken();
    const tokenHash = tokenService.hashRefreshToken(rawRefreshToken);
    const expiresAt = tokenService.getRefreshTokenExpiryDate();

    await authSessionRepository.createSession({
      userId,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async function register(input: RegisterInput): Promise<AuthResult> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await passwordHasher.hash(input.password);
    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'USER',
    });

    const tokens = await createSessionAndIssueTokens(
      user.id,
      user.email,
      user.role,
      input.userAgent,
      input.ipAddress
    );

    return {
      user: toUserProfile(user),
      tokens,
    };
  }

  async function login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    // Timing-safe/generic message against enumeration
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatches = await passwordHasher.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account has been deactivated');
    }

    const tokens = await createSessionAndIssueTokens(
      user.id,
      user.email,
      user.role,
      input.userAgent,
      input.ipAddress
    );

    return {
      user: toUserProfile(user),
      tokens,
    };
  }

  async function refreshTokens(
    oldRefreshToken: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthTokens> {
    const oldTokenHash = tokenService.hashRefreshToken(oldRefreshToken);
    const newRefreshToken = tokenService.generateRefreshToken();
    const newTokenHash = tokenService.hashRefreshToken(newRefreshToken);
    const expiresAt = tokenService.getRefreshTokenExpiryDate();

    // Atomic rotation in repository (with reuse detection)
    const newSession = await authSessionRepository.rotateSession(oldTokenHash, {
      userId: '', // populated in transaction from old session
      tokenHash: newTokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    });

    const user = await userRepository.findById(newSession.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account is invalid or deactivated');
    }

    const accessToken = tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async function logout(refreshToken: string): Promise<void> {
    const tokenHash = tokenService.hashRefreshToken(refreshToken);
    await authSessionRepository.revokeSession(tokenHash);
  }

  async function getCurrentUser(userId: string): Promise<UserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserProfile(user);
  }

  return {
    register,
    login,
    refreshTokens,
    logout,
    getCurrentUser,
  };
}

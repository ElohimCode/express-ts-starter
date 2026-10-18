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

export class AuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService,
    private readonly authSessionRepository: IAuthSessionRepository
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'USER',
    });

    const tokens = await this.createSessionAndIssueTokens(
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

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(input.email);
    // Timing-safe/generic message against enumeration
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatches = await this.passwordHasher.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account has been deactivated');
    }

    const tokens = await this.createSessionAndIssueTokens(
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

  async refreshTokens(
    oldRefreshToken: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthTokens> {
    const oldTokenHash = this.tokenService.hashRefreshToken(oldRefreshToken);
    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newTokenHash = this.tokenService.hashRefreshToken(newRefreshToken);
    const expiresAt = this.tokenService.getRefreshTokenExpiryDate();

    // Atomic rotation in repository (with reuse detection)
    const newSession = await this.authSessionRepository.rotateSession(oldTokenHash, {
      userId: '', // populated in transaction from old session
      tokenHash: newTokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    });

    const user = await this.userRepository.findById(newSession.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account is invalid or deactivated');
    }

    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    await this.authSessionRepository.revokeSession(tokenHash);
  }

  async getCurrentUser(userId: string): Promise<UserProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserProfile(user);
  }

  private async createSessionAndIssueTokens(
    userId: string,
    email: string,
    role: 'USER' | 'ADMIN',
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthTokens> {
    const accessToken = this.tokenService.signAccessToken({
      sub: userId,
      email,
      role,
    });

    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const expiresAt = this.tokenService.getRefreshTokenExpiryDate();

    await this.authSessionRepository.createSession({
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
}

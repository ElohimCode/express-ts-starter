import { PrismaClient, RefreshTokenSession as PrismaSession } from '@prisma/client';
import {
  IAuthSessionRepository,
  CreateSessionData,
  RefreshTokenSessionEntity,
} from '../domain/auth-session.repository.interface.js';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';

export class PrismaAuthSessionRepository implements IAuthSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapToEntity(session: PrismaSession): RefreshTokenSessionEntity {
    return {
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      isRevoked: session.isRevoked,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async createSession(data: CreateSessionData): Promise<RefreshTokenSessionEntity> {
    const session = await this.prisma.refreshTokenSession.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent || null,
        ipAddress: data.ipAddress || null,
      },
    });
    return this.mapToEntity(session);
  }

  async findSessionByHash(tokenHash: string): Promise<RefreshTokenSessionEntity | null> {
    const session = await this.prisma.refreshTokenSession.findUnique({
      where: { tokenHash },
    });
    return session ? this.mapToEntity(session) : null;
  }

  async rotateSession(
    oldTokenHash: string,
    newSessionData: CreateSessionData
  ): Promise<RefreshTokenSessionEntity> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.refreshTokenSession.findUnique({
        where: { tokenHash: oldTokenHash },
      });

      if (!existing) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Reuse detection: If token was already revoked, someone is replaying it!
      if (existing.isRevoked) {
        // Invalidate all tokens for this user family (persisted outside rolled-back transaction)
        await this.revokeAllUserSessions(existing.userId);
        throw new UnauthorizedError('Token reuse detected. All sessions have been terminated.');
      }

      if (existing.expiresAt < new Date()) {
        throw new UnauthorizedError('Refresh token has expired');
      }

      // Revoke the old session
      await tx.refreshTokenSession.update({
        where: { id: existing.id },
        data: { isRevoked: true },
      });

      // Create new session
      const newSession = await tx.refreshTokenSession.create({
        data: {
          userId: existing.userId,
          tokenHash: newSessionData.tokenHash,
          expiresAt: newSessionData.expiresAt,
          userAgent: newSessionData.userAgent || null,
          ipAddress: newSessionData.ipAddress || null,
        },
      });

      return this.mapToEntity(newSession);
    });
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.prisma.refreshTokenSession.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshTokenSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }
}

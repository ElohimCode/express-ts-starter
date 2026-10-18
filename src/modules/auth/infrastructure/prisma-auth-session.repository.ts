import { PrismaClient, RefreshTokenSession as PrismaSession } from '@prisma/client';
import {
  IAuthSessionRepository,
  CreateSessionData,
  RefreshTokenSessionEntity,
} from '../domain/auth-session.repository.interface.js';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';

export function createPrismaAuthSessionRepository(prisma: PrismaClient): IAuthSessionRepository {
  function mapToEntity(session: PrismaSession): RefreshTokenSessionEntity {
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

  async function createSession(data: CreateSessionData): Promise<RefreshTokenSessionEntity> {
    const session = await prisma.refreshTokenSession.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent || null,
        ipAddress: data.ipAddress || null,
      },
    });
    return mapToEntity(session);
  }

  async function findSessionByHash(tokenHash: string): Promise<RefreshTokenSessionEntity | null> {
    const session = await prisma.refreshTokenSession.findUnique({
      where: { tokenHash },
    });
    return session ? mapToEntity(session) : null;
  }

  async function revokeAllUserSessions(userId: string): Promise<void> {
    await prisma.refreshTokenSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  async function rotateSession(
    oldTokenHash: string,
    newSessionData: CreateSessionData
  ): Promise<RefreshTokenSessionEntity> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.refreshTokenSession.findUnique({
        where: { tokenHash: oldTokenHash },
      });

      if (!existing) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Reuse detection: If token was already revoked, someone is replaying it!
      if (existing.isRevoked) {
        // Invalidate all tokens for this user family (persisted outside rolled-back transaction)
        await revokeAllUserSessions(existing.userId);
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

      return mapToEntity(newSession);
    });
  }

  async function revokeSession(tokenHash: string): Promise<void> {
    await prisma.refreshTokenSession.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  return {
    createSession,
    findSessionByHash,
    rotateSession,
    revokeSession,
    revokeAllUserSessions,
  };
}

// Preserve class alias for backwards compatibility
export class PrismaAuthSessionRepository {
  private repo: IAuthSessionRepository;
  constructor(prisma: PrismaClient) {
    this.repo = createPrismaAuthSessionRepository(prisma);
  }
  createSession(data: CreateSessionData) {
    return this.repo.createSession(data);
  }
  findSessionByHash(tokenHash: string) {
    return this.repo.findSessionByHash(tokenHash);
  }
  rotateSession(oldTokenHash: string, newSessionData: CreateSessionData) {
    return this.repo.rotateSession(oldTokenHash, newSessionData);
  }
  revokeSession(tokenHash: string) {
    return this.repo.revokeSession(tokenHash);
  }
  revokeAllUserSessions(userId: string) {
    return this.repo.revokeAllUserSessions(userId);
  }
}

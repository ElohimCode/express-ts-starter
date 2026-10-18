export interface RefreshTokenSessionEntity {
  id: string;
  userId: string;
  tokenHash: string;
  isRevoked: boolean;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface IAuthSessionRepository {
  createSession(data: CreateSessionData): Promise<RefreshTokenSessionEntity>;
  findSessionByHash(tokenHash: string): Promise<RefreshTokenSessionEntity | null>;
  rotateSession(
    oldTokenHash: string,
    newSessionData: CreateSessionData
  ): Promise<RefreshTokenSessionEntity>;
  revokeSession(tokenHash: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
}

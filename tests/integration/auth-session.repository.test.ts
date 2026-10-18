import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { createPrismaAuthSessionRepository } from '../../src/modules/auth/infrastructure/prisma-auth-session.repository.js';
import { IAuthSessionRepository } from '../../src/modules/auth/domain/auth-session.repository.interface.js';
import { UnauthorizedError } from '../../src/shared/errors/app-error.js';
import { randomUUID } from 'node:crypto';

describe('PrismaAuthSessionRepository (Integration)', () => {
  let prisma: PrismaClient;
  let sessionRepo: IAuthSessionRepository;
  let testUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    sessionRepo = createPrismaAuthSessionRepository(prisma);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: 'integration-test' } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `integration-test-${randomUUID()}@example.com`,
        passwordHash: 'dummy_hash',
        firstName: 'Integration',
        lastName: 'Tester',
        role: Role.USER,
      },
    });
    testUserId = user.id;
  });

  it('creates and finds a session by hash', async () => {
    const tokenHash = `hash_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    const session = await sessionRepo.createSession({
      userId: testUserId,
      tokenHash,
      expiresAt,
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(testUserId);
    expect(session.isRevoked).toBe(false);

    const found = await sessionRepo.findSessionByHash(tokenHash);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(session.id);
  });

  it('successfully rotates a valid refresh token', async () => {
    const oldTokenHash = `old_hash_${randomUUID()}`;
    const newTokenHash = `new_hash_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await sessionRepo.createSession({
      userId: testUserId,
      tokenHash: oldTokenHash,
      expiresAt,
    });

    const rotatedSession = await sessionRepo.rotateSession(oldTokenHash, {
      userId: testUserId,
      tokenHash: newTokenHash,
      expiresAt,
    });

    expect(rotatedSession.tokenHash).toBe(newTokenHash);
    expect(rotatedSession.isRevoked).toBe(false);

    // Old session must now be revoked
    const oldSession = await sessionRepo.findSessionByHash(oldTokenHash);
    expect(oldSession?.isRevoked).toBe(true);
  });

  it('detects token reuse and revokes ALL user sessions', async () => {
    const token1 = `t1_${randomUUID()}`;
    const token2 = `t2_${randomUUID()}`;
    const token3 = `t3_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    // Create session 1
    await sessionRepo.createSession({
      userId: testUserId,
      tokenHash: token1,
      expiresAt,
    });

    // Legitimate rotation to session 2 (revokes session 1)
    await sessionRepo.rotateSession(token1, {
      userId: testUserId,
      tokenHash: token2,
      expiresAt,
    });

    // Attempting to rotate again using the already revoked token1 (REPLAY ATTACK)
    await expect(
      sessionRepo.rotateSession(token1, {
        userId: testUserId,
        tokenHash: token3,
        expiresAt,
      })
    ).rejects.toThrow(UnauthorizedError);

    // Verify session 2 was ALSO revoked as a consequence of reuse detection!
    const session2 = await sessionRepo.findSessionByHash(token2);
    expect(session2?.isRevoked).toBe(true);
  });
});

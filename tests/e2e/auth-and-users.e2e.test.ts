import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AppContainer, createContainer } from '../../src/container/register-dependencies.js';
import { randomUUID } from 'node:crypto';

describe('Auth & Users Endpoints (E2E)', () => {
  let app: ReturnType<typeof createApp>['app'];
  let container: AppContainer;
  const testEmail = `e2e-user-${randomUUID()}@example.com`;
  const testPassword = 'SecurePassword123!';
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    container = createContainer();
    await container.infrastructure.prismaService.connect();
    await container.infrastructure.redisService.connect();
    const appInstance = createApp(container);
    app = appInstance.app;
  });

  afterAll(async () => {
    const prisma = container.infrastructure.prismaService.getClient();
    await prisma.user.deleteMany({ where: { email: { contains: 'e2e' } } });
    await container.infrastructure.redisService.disconnect();
    await container.infrastructure.prismaService.disconnect();
  });

  describe('POST /api/v1/auth/register', () => {
    it('rejects invalid email or weak password', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'invalid-email',
        password: '123',
        firstName: 'Bad',
        lastName: 'Req',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(1);
    });

    it('successfully registers user', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: testEmail,
        password: testPassword,
        firstName: 'Alice',
        lastName: 'Smith',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');

      accessToken = res.body.data.tokens.accessToken;
      refreshToken = res.body.data.tokens.refreshToken;
    });

    it('rejects duplicate email with 409 CONFLICT', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: testEmail,
        password: testPassword,
        firstName: 'Alice',
        lastName: 'Smith',
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toHaveProperty('code', 'CONFLICT');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('authenticates valid credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: testEmail,
        password: testPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      accessToken = res.body.data.tokens.accessToken;
      refreshToken = res.body.data.tokens.refreshToken;
    });

    it('rejects incorrect password with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: testEmail,
        password: 'WrongPassword999!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET & PATCH /api/v1/users/me', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/users/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('retrieves current user profile with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testEmail);
      expect(res.body.data.firstName).toBe('Alice');
    });

    it('updates user profile allowed fields', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'Alicia',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.firstName).toBe('Alicia');
    });
  });

  describe('Role-based Authorization: GET /api/v1/users', () => {
    it('forbids standard user from listing all users (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });

    it('allows admin user to list users', async () => {
      // Login with seeded admin
      const adminLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'admin@starter.dev',
        password: 'AdminPassword123!',
      });

      expect(adminLogin.status).toBe(200);
      const adminToken = adminLogin.body.data.tokens.accessToken;

      const res = await request(app)
        .get('/api/v1/users?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('total');
    });
  });

  describe('POST /api/v1/auth/refresh & logout', () => {
    it('rotates refresh token', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');

      refreshToken = res.body.data.refreshToken;
    });

    it('revokes session on logout', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({
        refreshToken,
      });

      expect(res.status).toBe(200);

      // Now trying to refresh with logged-out token should fail
      const refreshRes = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken,
      });

      expect(refreshRes.status).toBe(401);
    });
  });
});

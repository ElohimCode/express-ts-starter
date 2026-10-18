import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AppContainer, createContainer } from '../../src/container/register-dependencies.js';
import { randomUUID } from 'node:crypto';

describe('Jobs Endpoints & Idempotency (E2E)', () => {
  let app: ReturnType<typeof createApp>['app'];
  let container: AppContainer;
  let userToken: string;
  let createdJobId: string;

  beforeAll(async () => {
    container = createContainer();
    await container.infrastructure.prismaService.connect();
    await container.infrastructure.redisService.connect();
    const appInstance = createApp(container);
    app = appInstance.app;

    // Login with seeded user
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'user@starter.dev',
      password: 'UserPassword123!',
    });
    userToken = loginRes.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await container.infrastructure.redisService.disconnect();
    await container.infrastructure.prismaService.disconnect();
  });

  describe('POST /api/v1/jobs with Idempotency', () => {
    const idempotencyKey = `e2e_key_${randomUUID()}`;
    const payload = {
      type: 'SEND_NOTIFICATION',
      payload: {
        recipient: 'client@example.com',
        title: 'Invoice Ready',
        message: 'Your monthly invoice is available for download.',
        channel: 'email',
      },
    };

    it('submits job and returns 202 ACCEPTED', async () => {
      const res = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.type).toBe('SEND_NOTIFICATION');

      createdJobId = res.body.data.id;
    });

    it('replays identical response when called again with the same idempotency key', async () => {
      // Allow async idempotency save to finalize
      await new Promise((resolve) => setTimeout(resolve, 100));

      const res = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.header['idempotent-replayed']).toBe('true');
      expect(res.body.data.id).toBe(createdJobId);
    });

    it('rejects reusing the same idempotency key with different payload', async () => {
      const differentPayload = {
        type: 'SEND_NOTIFICATION',
        payload: {
          recipient: 'different-recipient@example.com',
          title: 'Different Title',
          message: 'Different Message',
        },
      };

      const res = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(differentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error).toHaveProperty('code', 'IDEMPOTENCY_CONFLICT');
    });
  });

  describe('GET /api/v1/jobs/:id and GET /api/v1/jobs', () => {
    it('retrieves job by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${createdJobId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdJobId);
      expect(res.body.data.type).toBe('SEND_NOTIFICATION');
    });

    it('returns 404 for non-existent job ID', async () => {
      const nonExistentId = randomUUID();
      const res = await request(app)
        .get(`/api/v1/jobs/${nonExistentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('lists jobs with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/jobs?page=1&limit=10')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('page', 1);
    });
  });
});

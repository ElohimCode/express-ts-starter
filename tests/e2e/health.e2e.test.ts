import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AppContainer, createContainer } from '../../src/container/register-dependencies.js';

describe('Health Endpoints (E2E)', () => {
  let app: ReturnType<typeof createApp>['app'];
  let container: AppContainer;

  beforeAll(async () => {
    container = createContainer();
    await container.infrastructure.prismaService.connect();
    await container.infrastructure.redisService.connect();
    const appInstance = createApp(container);
    app = appInstance.app;
  });

  afterAll(async () => {
    await container.infrastructure.redisService.disconnect();
    await container.infrastructure.prismaService.disconnect();
  });

  it('GET /api/v1/health/live returns 200 UP', async () => {
    const res = await request(app).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'UP');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/v1/health/ready returns 200 UP with checks', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'UP');
    expect(res.body.checks).toEqual({
      database: 'UP',
      redis: 'UP',
    });
  });
});

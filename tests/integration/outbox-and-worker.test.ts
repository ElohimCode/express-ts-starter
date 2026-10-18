import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, OutboxStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { createPrismaJobRepository } from '../../src/modules/jobs/infrastructure/prisma-job.repository.js';
import { IJobRepository } from '../../src/modules/jobs/domain/job.repository.interface.js';
import { BullMqQueueService } from '../../src/infrastructure/queue/bullmq-queue.service.js';
import { OutboxDispatcher } from '../../src/infrastructure/queue/outbox-dispatcher.js';
import { WorkerRunner } from '../../src/infrastructure/queue/worker-runner.js';
import { createLoggerNotificationService } from '../../src/modules/jobs/infrastructure/logger-notification.service.js';
import { INotificationService } from '../../src/modules/jobs/domain/notification.service.interface.js';
import { JOB_TYPES } from '../../src/modules/jobs/infrastructure/queue.constants.js';
import { env } from '../../src/config/env.js';

describe('Outbox and Worker Lifecycle (Integration)', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let jobRepo: IJobRepository;
  let queueService: BullMqQueueService;
  let outboxDispatcher: OutboxDispatcher;
  let workerRunner: WorkerRunner;
  let notificationService: INotificationService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });
    await redis.ping();

    jobRepo = createPrismaJobRepository(prisma);
    queueService = new BullMqQueueService(redis);
    outboxDispatcher = new OutboxDispatcher(prisma, queueService, 10, 500);
    notificationService = createLoggerNotificationService();
    workerRunner = new WorkerRunner(redis, jobRepo, notificationService, 2);
  });

  afterAll(async () => {
    await workerRunner.close();
    await outboxDispatcher.stop();
    await queueService.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  it('persists job and outbox event atomically, dispatches, and processes to COMPLETED', async () => {
    // 1. Create job with outbox in transaction
    const { job, outboxEventId } = await jobRepo.createWithOutbox({
      type: JOB_TYPES.SEND_NOTIFICATION,
      payload: {
        recipient: 'integration-test@example.com',
        title: 'Welcome',
        message: 'Hello from integration test!',
        channel: 'email',
      },
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe('PENDING');

    // Verify outbox record in DB
    const outboxRecord = await prisma.outboxEvent.findUnique({
      where: { id: outboxEventId },
    });
    expect(outboxRecord?.status).toBe(OutboxStatus.PENDING);
    expect(outboxRecord?.aggregateId).toBe(job.id);

    // 2. Start worker
    workerRunner.start();

    // 3. Dispatch outbox event to BullMQ
    const dispatchedCount = await outboxDispatcher.dispatchPendingEvents();
    expect(dispatchedCount).toBeGreaterThanOrEqual(1);

    // Verify outbox record transitioned to PUBLISHED
    const updatedOutbox = await prisma.outboxEvent.findUnique({
      where: { id: outboxEventId },
    });
    expect(updatedOutbox?.status).toBe(OutboxStatus.PUBLISHED);

    // 4. Poll database until Worker completes the job
    let completedJob = await jobRepo.findById(job.id);
    let attempts = 0;
    while (completedJob?.status !== 'COMPLETED' && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      completedJob = await jobRepo.findById(job.id);
      attempts++;
    }

    expect(completedJob?.status).toBe('COMPLETED');
    expect(completedJob?.result).toHaveProperty('delivered', true);
    expect(completedJob?.result).toHaveProperty('messageId');
    expect(completedJob?.completedAt).not.toBeNull();
  });
});

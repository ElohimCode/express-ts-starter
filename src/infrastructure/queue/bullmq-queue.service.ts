import { Queue, JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_QUEUE_NAME } from '../../modules/jobs/infrastructure/queue.constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface EnqueueJobPayload {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}

export class BullMqQueueService {
  private queue: Queue;

  constructor(redisClient: Redis) {
    this.queue = new Queue(APP_QUEUE_NAME, {
      connection: redisClient,
      defaultJobOptions: {
        attempts: env.JOB_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: env.JOB_BACKOFF_DELAY_MS,
        },
        removeOnComplete: {
          count: 200,
          age: 24 * 3600, // 24 hours
        },
        removeOnFail: {
          count: 500,
          age: 7 * 24 * 3600, // 7 days
        },
      },
    });

    this.queue.on('error', (err) => {
      logger.error({ err }, 'BullMQ Queue error');
    });
  }

  public getQueue(): Queue {
    return this.queue;
  }

  public async enqueue(jobData: EnqueueJobPayload, customOptions?: JobsOptions): Promise<void> {
    await this.queue.add(jobData.type, jobData, {
      jobId: jobData.jobId, // Ensures BullMQ deduplication by stable job ID
      attempts: jobData.maxAttempts || env.JOB_MAX_RETRIES,
      ...customOptions,
    });

    logger.debug({ jobId: jobData.jobId, type: jobData.type }, 'Job enqueued to BullMQ');
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}

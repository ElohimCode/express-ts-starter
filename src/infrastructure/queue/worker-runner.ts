import { Worker, Job as BullJob } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_QUEUE_NAME, JOB_TYPES } from '../../modules/jobs/infrastructure/queue.constants.js';
import { IJobRepository } from '../../modules/jobs/domain/job.repository.interface.js';
import {
  INotificationService,
  NotificationPayload,
} from '../../modules/jobs/domain/notification.service.interface.js';
import { EnqueueJobPayload } from './bullmq-queue.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export class WorkerRunner {
  private worker: Worker<EnqueueJobPayload> | null = null;

  constructor(
    private readonly redisClient: Redis,
    private readonly jobRepository: IJobRepository,
    private readonly notificationService: INotificationService,
    private readonly concurrency: number = env.WORKER_CONCURRENCY
  ) {}

  public start(): void {
    if (this.worker) return;

    logger.info({ concurrency: this.concurrency }, 'Starting BullMQ worker');

    this.worker = new Worker<EnqueueJobPayload>(
      APP_QUEUE_NAME,
      async (bullJob: BullJob<EnqueueJobPayload>) => {
        const { jobId, type, payload } = bullJob.data;
        const startTime = Date.now();

        logger.info(
          { jobId, type, bullJobId: bullJob.id, attempt: bullJob.attemptsMade + 1 },
          'Worker processing job'
        );

        // Fetch authoritative job record from database
        const dbJob = await this.jobRepository.findById(jobId);
        if (!dbJob) {
          logger.warn({ jobId }, 'Job record not found in database, skipping processing');
          return;
        }

        // Check if already completed (idempotency guard)
        if (dbJob.status === 'COMPLETED') {
          logger.info({ jobId }, 'Job already marked COMPLETED in database, skipping replay');
          return;
        }

        const currentAttempts = bullJob.attemptsMade + 1;

        // Transition to PROCESSING
        await this.jobRepository.updateStatus(jobId, 'PROCESSING', {
          startedAt: dbJob.startedAt || new Date(),
          attempts: currentAttempts,
        });

        try {
          let result: Record<string, unknown> = {};

          if (type === JOB_TYPES.SEND_NOTIFICATION) {
            const outcome = await this.notificationService.send(
              payload as unknown as NotificationPayload
            );
            result = outcome as unknown as Record<string, unknown>;
          } else {
            throw new Error(`Unsupported job type: '${type}'`);
          }

          // Mark job as COMPLETED in authoritative database
          await this.jobRepository.updateStatus(jobId, 'COMPLETED', {
            result,
            completedAt: new Date(),
            error: null,
          });

          const durationMs = Date.now() - startTime;
          logger.info({ jobId, type, durationMs }, 'Job completed successfully');
          return result;
        } catch (err) {
          const durationMs = Date.now() - startTime;
          const errorMessage = err instanceof Error ? err.message : String(err);
          const isFinalAttempt = currentAttempts >= dbJob.maxAttempts;

          logger.error(
            {
              jobId,
              type,
              attempt: currentAttempts,
              maxAttempts: dbJob.maxAttempts,
              err,
              durationMs,
            },
            'Job execution failed'
          );

          // Update authoritative job record
          await this.jobRepository.updateStatus(jobId, isFinalAttempt ? 'FAILED' : 'PENDING', {
            error: errorMessage,
            completedAt: isFinalAttempt ? new Date() : null,
          });

          // Rethrow to let BullMQ handle retry / dead-letter
          throw err;
        }
      },
      {
        connection: this.redisClient,
        concurrency: this.concurrency,
      }
    );

    this.worker.on('completed', (job) => {
      logger.debug({ jobId: job.data.jobId }, 'BullMQ job event: completed');
    });

    this.worker.on('failed', (job, err) => {
      logger.warn({ jobId: job?.data.jobId, err: err.message }, 'BullMQ job event: failed');
    });

    this.worker.on('error', (err) => {
      logger.error({ err }, 'BullMQ Worker internal error');
    });
  }

  public async close(): Promise<void> {
    if (this.worker) {
      logger.info('Stopping BullMQ worker...');
      await this.worker.close();
      this.worker = null;
      logger.info('BullMQ worker stopped');
    }
  }
}

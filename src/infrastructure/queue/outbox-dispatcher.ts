import { PrismaClient, OutboxStatus } from '@prisma/client';
import { BullMqQueueService } from './bullmq-queue.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

interface OutboxRow {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload: {
    jobId: string;
    type: string;
    payload: Record<string, unknown>;
    maxAttempts?: number;
  };
  attempts: number;
}

export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isDispatching = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly queueService: BullMqQueueService,
    private readonly batchSize: number = env.OUTBOX_BATCH_SIZE,
    private readonly intervalMs: number = env.OUTBOX_DISPATCH_INTERVAL_MS
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info(
      { intervalMs: this.intervalMs, batchSize: this.batchSize },
      'Outbox dispatcher started'
    );

    const scheduleNext = () => {
      if (!this.isRunning) return;
      this.timer = setTimeout(async () => {
        try {
          await this.dispatchPendingEvents();
        } catch (err) {
          logger.error({ err }, 'Error during outbox dispatch cycle');
        } finally {
          scheduleNext();
        }
      }, this.intervalMs);
    };

    scheduleNext();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Wait if an active dispatch cycle is currently running
    while (this.isDispatching) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    logger.info('Outbox dispatcher stopped');
  }

  public async dispatchPendingEvents(): Promise<number> {
    if (this.isDispatching) return 0;
    this.isDispatching = true;

    let processedCount = 0;

    try {
      // Execute transactional lock and batch fetch
      const events = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, aggregate_id, event_type, payload, attempts
          FROM outbox_events
          WHERE status = 'PENDING'::"OutboxStatus"
          ORDER BY created_at ASC
          LIMIT ${this.batchSize}
          FOR UPDATE SKIP LOCKED
        `;
        return rows;
      });

      if (!events || events.length === 0) {
        return 0;
      }

      for (const event of events) {
        try {
          // Publish to BullMQ with stable event ID
          await this.queueService.enqueue({
            jobId: event.aggregate_id,
            type: event.payload.type,
            payload: event.payload.payload,
            maxAttempts: event.payload.maxAttempts,
          });

          // Mark published
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.PUBLISHED,
              processedAt: new Date(),
            },
          });

          processedCount++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const nextAttempts = event.attempts + 1;
          const status = nextAttempts >= 5 ? OutboxStatus.FAILED : OutboxStatus.PENDING;

          logger.error(
            { err, outboxId: event.id, aggregateId: event.aggregate_id, attempts: nextAttempts },
            'Failed to publish outbox event to queue'
          );

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status,
              attempts: nextAttempts,
              lastError: errorMessage,
            },
          });
        }
      }
    } finally {
      this.isDispatching = false;
    }

    if (processedCount > 0) {
      logger.info({ processedCount }, 'Successfully dispatched outbox events to BullMQ');
    }

    return processedCount;
  }
}

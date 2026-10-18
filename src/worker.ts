import { createContainer } from './container/register-dependencies.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

let isShuttingDown = false;

async function bootstrapWorker(): Promise<void> {
  try {
    logger.info({ nodeEnv: env.NODE_ENV }, 'Starting background job worker process...');

    const container = createContainer();

    // 1. Verify PostgreSQL readiness
    logger.info('Worker: verifying database connectivity...');
    await container.infrastructure.prismaService.connect();
    logger.info('Worker: database connection established');

    // 2. Verify Redis readiness
    logger.info('Worker: verifying Redis connectivity...');
    await container.infrastructure.redisService.connect();
    logger.info('Worker: Redis connection established');

    // 3. Start BullMQ worker processor
    container.infrastructure.workerRunner.start();

    logger.info(
      { concurrency: env.WORKER_CONCURRENCY },
      'Background worker process is active and consuming jobs'
    );

    // 4. Graceful shutdown handler
    const handleShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info({ signal }, 'Worker: shutdown signal received. Stopping worker gracefully...');

      const forceExitTimer = setTimeout(() => {
        logger.error('Worker: graceful shutdown timeout exceeded. Forcing exit.');
        process.exit(1);
      }, env.SHUTDOWN_TIMEOUT_MS);

      forceExitTimer.unref();

      try {
        // Stop accepting new jobs and wait for in-flight jobs to finish
        await container.infrastructure.workerRunner.close();

        // Close queue connections
        await container.infrastructure.queueService.close();

        // Disconnect Redis
        await container.infrastructure.redisService.disconnect();

        // Disconnect Prisma
        await container.infrastructure.prismaService.disconnect();

        clearTimeout(forceExitTimer);
        logger.info('Worker: graceful shutdown completed cleanly.');
        process.exit(0);
      } catch (err) {
        clearTimeout(forceExitTimer);
        logger.error({ err }, 'Worker: error during shutdown sequence');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
    process.on('SIGINT', () => void handleShutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Worker: fatal startup error. Process aborting.');
    process.exit(1);
  }
}

bootstrapWorker();

import { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

let server: Server | null = null;
let isShuttingDown = false;

async function bootstrap(): Promise<void> {
  try {
    logger.info(
      { nodeEnv: env.NODE_ENV, port: env.PORT },
      'Initializing application infrastructure...'
    );

    const { app, container } = createApp();

    // 1. Verify PostgreSQL readiness
    logger.info('Verifying database connectivity...');
    await container.infrastructure.prismaService.connect();
    logger.info('Database connection established successfully');

    // 2. Verify Redis readiness
    logger.info('Verifying Redis connectivity...');
    await container.infrastructure.redisService.connect();
    logger.info('Redis connection established successfully');

    // 3. Start Outbox Dispatcher in API process
    container.infrastructure.outboxDispatcher.start();

    // 4. Start HTTP Server
    server = app.listen(env.PORT, env.HOST, () => {
      logger.info(
        {
          port: env.PORT,
          host: env.HOST,
          env: env.NODE_ENV,
          corsOrigins: env.CORS_ORIGIN,
        },
        'HTTP Server started and listening for requests'
      );
    });

    // 5. Graceful shutdown handler
    const handleShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info({ signal }, 'Shutdown signal received. Starting graceful shutdown sequence...');

      // Set bounded shutdown timeout
      const forceExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded. Forcing process exit.');
        process.exit(1);
      }, env.SHUTDOWN_TIMEOUT_MS);

      // Unref the timer so it does not keep process open if done earlier
      forceExitTimer.unref();

      try {
        // Stop accepting new HTTP connections
        if (server) {
          logger.info('Stopping HTTP server from accepting new connections...');
          await new Promise<void>((resolve, reject) => {
            server?.close((err) => {
              if (err) return reject(err);
              resolve();
            });
          });
          logger.info('HTTP server closed successfully');
        }

        // Stop outbox dispatcher
        await container.infrastructure.outboxDispatcher.stop();

        // Close queue publisher
        await container.infrastructure.queueService.close();

        // Disconnect Redis
        await container.infrastructure.redisService.disconnect();

        // Disconnect Prisma
        await container.infrastructure.prismaService.disconnect();

        clearTimeout(forceExitTimer);
        logger.info('Graceful shutdown completed cleanly. Exiting.');
        process.exit(0);
      } catch (err) {
        clearTimeout(forceExitTimer);
        logger.error({ err }, 'Error occurred during graceful shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
    process.on('SIGINT', () => void handleShutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Fatal error during application startup. Process aborting.');
    process.exit(1);
  }
}

bootstrap();

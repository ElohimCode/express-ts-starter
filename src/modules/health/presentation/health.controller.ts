import { RequestHandler } from 'express';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';

export interface HealthControllerDependencies {
  prismaService: PrismaService;
  redisService?: RedisService;
}

export interface HealthController {
  live: RequestHandler;
  ready: RequestHandler;
}

export function createHealthController(
  dependencies: HealthControllerDependencies
): HealthController {
  const { prismaService, redisService } = dependencies;

  const live: RequestHandler = (_req, res) => {
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
    });
  };

  const ready: RequestHandler = async (_req, res) => {
    const dbHealthy = await prismaService.isHealthy();
    const redisHealthy = redisService ? await redisService.isHealthy() : true;

    const isReady = dbHealthy && redisHealthy;
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'UP' : 'DOWN',
        ...(redisService ? { redis: redisHealthy ? 'UP' : 'DOWN' } : {}),
      },
    });
  };

  return {
    live,
    ready,
  };
}

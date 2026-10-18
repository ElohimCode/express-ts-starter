import { Request, Response } from 'express';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';

export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService?: RedisService
  ) {}

  live = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
    });
  };

  ready = async (_req: Request, res: Response): Promise<void> => {
    const dbHealthy = await this.prismaService.isHealthy();
    const redisHealthy = this.redisService ? await this.redisService.isHealthy() : true;

    const isReady = dbHealthy && redisHealthy;
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'UP' : 'DOWN',
        ...(this.redisService ? { redis: redisHealthy ? 'UP' : 'DOWN' } : {}),
      },
    });
  };
}

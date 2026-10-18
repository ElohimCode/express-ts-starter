import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';

export class PrismaService {
  private client: PrismaClient;

  constructor() {
    this.client = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Optional query logging at debug level
    this.client.$on('query' as never, (e: { query: string; duration: number }) => {
      logger.debug({ query: e.query, durationMs: e.duration }, 'Database query executed');
    });

    this.client.$on('error' as never, (e: { message: string }) => {
      logger.error({ error: e.message }, 'Database error');
    });
  }

  public getClient(): PrismaClient {
    return this.client;
  }

  public async connect(): Promise<void> {
    await this.client.$connect();
    // Test connectivity
    await this.client.$queryRaw`SELECT 1`;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      logger.error({ err }, 'Prisma health check failed');
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }
}

import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export class RedisService {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null, // Required by BullMQ
      lazyConnect: true,
      enableReadyCheck: true,
    });

    this.client.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });
  }

  public getClient(): Redis {
    return this.client;
  }

  public async connect(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    await this.client.ping();
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch (err) {
      logger.error({ err }, 'Redis health check failed');
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.client.status !== 'end') {
        await this.client.quit();
      }
    } catch (err) {
      logger.warn({ err }, 'Redis graceful disconnect failed, forcing disconnect');
      this.client.disconnect();
    }
  }
}

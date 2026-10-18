import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // Security & CORS
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((val) =>
      val
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((val) => val.toLowerCase() === 'true' || val === '1'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  JWT_REFRESH_EXPIRATION_DAYS: z.coerce.number().int().positive().default(7),
  JWT_ISSUER: z.string().default('express-starter-kit'),
  JWT_AUDIENCE: z.string().default('express-starter-kit-api'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  // Worker & Queues
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  OUTBOX_DISPATCH_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  JOB_MAX_RETRIES: z.coerce.number().int().min(1).default(3),
  JOB_BACKOFF_DELAY_MS: z.coerce.number().int().positive().default(2000),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z
    .string()
    .default('false')
    .transform((val) => val.toLowerCase() === 'true' || val === '1'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.errors
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    // Safe error message: do not expose secret values
    // Using process.stderr directly during bootstrap before logger is initialized
    process.stderr.write(`❌ Environment validation failed:\n${errorDetails}\n`);
    throw new Error(`Environment validation failed:\n${errorDetails}`);
  }

  return result.data;
}

export const env = loadEnv();

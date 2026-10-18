import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { requestIdMiddleware } from './shared/middleware/request-id.middleware.js';
import { requestLogger } from './shared/middleware/request-logger.middleware.js';
import { notFoundMiddleware } from './shared/middleware/not-found.middleware.js';
import { errorHandlerMiddleware } from './shared/middleware/error-handler.middleware.js';
import { standardRateLimiter } from './shared/middleware/rate-limiter.middleware.js';
import { AppContainer, createContainer } from './container/register-dependencies.js';

export function createApp(container: AppContainer = createContainer()): {
  app: Express;
  container: AppContainer;
} {
  const app = express();

  // Configure reverse proxy trust deliberately
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  // 1. Request ID / correlation context
  app.use(requestIdMiddleware);

  // 2. Security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 3. CORS with explicit allowed origins and methods
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGIN.indexOf(origin) !== -1 || env.CORS_ORIGIN.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
      credentials: true,
      maxAge: 86400, // 24 hours
    })
  );

  // 4. Request logging
  app.use(requestLogger);

  // 5. Request body parsing with bounded size limits (1mb)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global rate limiter for standard routes
  app.use(standardRateLimiter);

  // 6. API routes (versioned under /api/v1)
  const apiV1Router = express.Router();
  apiV1Router.use('/health', container.routers.healthRouter);
  apiV1Router.use('/auth', container.routers.authRouter);
  apiV1Router.use('/users', container.routers.userRouter);
  apiV1Router.use('/jobs', container.routers.jobRouter);

  app.use('/api/v1', apiV1Router);

  // 7. Not found handling
  app.use(notFoundMiddleware);

  // 8. Centralized error handling
  app.use(errorHandlerMiddleware);

  return { app, container };
}

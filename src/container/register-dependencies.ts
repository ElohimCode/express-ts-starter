import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { RedisService } from '../infrastructure/cache/redis.service.js';
import { BullMqQueueService } from '../infrastructure/queue/bullmq-queue.service.js';
import { OutboxDispatcher } from '../infrastructure/queue/outbox-dispatcher.js';
import { WorkerRunner } from '../infrastructure/queue/worker-runner.js';
import { LoggerNotificationService } from '../modules/jobs/infrastructure/logger-notification.service.js';

import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { JwtTokenService } from '../modules/auth/infrastructure/jwt-token.service.js';
import { PrismaAuthSessionRepository } from '../modules/auth/infrastructure/prisma-auth-session.repository.js';
import { AuthService } from '../modules/auth/application/auth.service.js';
import { AuthController } from '../modules/auth/presentation/auth.controller.js';
import { createAuthMiddleware } from '../modules/auth/presentation/auth.middleware.js';
import { createAuthRouter } from '../modules/auth/presentation/auth.routes.js';

import { PrismaUserRepository } from '../modules/users/infrastructure/prisma-user.repository.js';
import { UserService } from '../modules/users/application/user.service.js';
import { UserController } from '../modules/users/presentation/user.controller.js';
import { createUserRouter } from '../modules/users/presentation/user.routes.js';

import { PrismaJobRepository } from '../modules/jobs/infrastructure/prisma-job.repository.js';
import { JobService } from '../modules/jobs/application/job.service.js';
import { JobController } from '../modules/jobs/presentation/job.controller.js';
import { createJobRouter } from '../modules/jobs/presentation/job.routes.js';
import { createIdempotencyMiddleware } from '../shared/middleware/idempotency.middleware.js';

import { HealthController } from '../modules/health/presentation/health.controller.js';
import { createHealthRouter } from '../modules/health/presentation/health.routes.js';

import { Router } from 'express';

export interface AppContainer {
  infrastructure: {
    prismaService: PrismaService;
    redisService: RedisService;
    queueService: BullMqQueueService;
    outboxDispatcher: OutboxDispatcher;
    workerRunner: WorkerRunner;
    notificationService: LoggerNotificationService;
  };
  services: {
    authService: AuthService;
    userService: UserService;
    jobService: JobService;
    tokenService: JwtTokenService;
    passwordHasher: Argon2PasswordHasher;
  };
  repositories: {
    userRepository: PrismaUserRepository;
    authSessionRepository: PrismaAuthSessionRepository;
    jobRepository: PrismaJobRepository;
  };
  controllers: {
    authController: AuthController;
    userController: UserController;
    jobController: JobController;
    healthController: HealthController;
  };
  routers: {
    authRouter: Router;
    userRouter: Router;
    jobRouter: Router;
    healthRouter: Router;
  };
}

export function createContainer(): AppContainer {
  // 1. Infrastructure layer
  const prismaService = new PrismaService();
  const redisService = new RedisService();
  const prismaClient = prismaService.getClient();
  const redisClient = redisService.getClient();

  const queueService = new BullMqQueueService(redisClient);
  const outboxDispatcher = new OutboxDispatcher(prismaClient, queueService);
  const notificationService = new LoggerNotificationService();

  // 2. Repositories
  const userRepository = new PrismaUserRepository(prismaClient);
  const authSessionRepository = new PrismaAuthSessionRepository(prismaClient);
  const jobRepository = new PrismaJobRepository(prismaClient);

  // 3. Worker runner
  const workerRunner = new WorkerRunner(redisClient, jobRepository, notificationService);

  // 4. Domain & Application services
  const passwordHasher = new Argon2PasswordHasher();
  const tokenService = new JwtTokenService();

  const authService = new AuthService(
    userRepository,
    passwordHasher,
    tokenService,
    authSessionRepository
  );

  const userService = new UserService(userRepository);
  const jobService = new JobService(jobRepository);

  // 5. Presentation layer
  const authController = new AuthController(authService);
  const userController = new UserController(userService);
  const jobController = new JobController(jobService);
  const healthController = new HealthController(prismaService, redisService);

  const authenticateMiddleware = createAuthMiddleware(tokenService);
  const idempotencyMiddleware = createIdempotencyMiddleware(prismaClient, 'SUBMIT_JOB');

  const authRouter = createAuthRouter(authController, authenticateMiddleware);
  const userRouter = createUserRouter(userController, authenticateMiddleware);
  const jobRouter = createJobRouter(jobController, authenticateMiddleware, idempotencyMiddleware);
  const healthRouter = createHealthRouter(healthController);

  return {
    infrastructure: {
      prismaService,
      redisService,
      queueService,
      outboxDispatcher,
      workerRunner,
      notificationService,
    },
    services: {
      authService,
      userService,
      jobService,
      tokenService,
      passwordHasher,
    },
    repositories: {
      userRepository,
      authSessionRepository,
      jobRepository,
    },
    controllers: {
      authController,
      userController,
      jobController,
      healthController,
    },
    routers: {
      authRouter,
      userRouter,
      jobRouter,
      healthRouter,
    },
  };
}

import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { RedisService } from '../infrastructure/cache/redis.service.js';
import { BullMqQueueService } from '../infrastructure/queue/bullmq-queue.service.js';
import { OutboxDispatcher } from '../infrastructure/queue/outbox-dispatcher.js';
import { WorkerRunner } from '../infrastructure/queue/worker-runner.js';
import { createLoggerNotificationService } from '../modules/jobs/infrastructure/logger-notification.service.js';
import { INotificationService } from '../modules/jobs/domain/notification.service.interface.js';

import { createArgon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { createJwtTokenService } from '../modules/auth/infrastructure/jwt-token.service.js';
import { createPrismaAuthSessionRepository } from '../modules/auth/infrastructure/prisma-auth-session.repository.js';
import { createAuthService, AuthService } from '../modules/auth/application/auth.service.js';
import {
  createAuthController,
  AuthController,
} from '../modules/auth/presentation/auth.controller.js';
import { createAuthMiddleware } from '../modules/auth/presentation/auth.middleware.js';
import { createAuthRouter } from '../modules/auth/presentation/auth.routes.js';
import { IPasswordHasher } from '../modules/auth/domain/password-hasher.interface.js';
import { ITokenService } from '../modules/auth/domain/token.service.interface.js';
import { IAuthSessionRepository } from '../modules/auth/domain/auth-session.repository.interface.js';

import { createPrismaUserRepository } from '../modules/users/infrastructure/prisma-user.repository.js';
import { createUserService, UserService } from '../modules/users/application/user.service.js';
import {
  createUserController,
  UserController,
} from '../modules/users/presentation/user.controller.js';
import { createUserRouter } from '../modules/users/presentation/user.routes.js';
import { IUserRepository } from '../modules/users/domain/user.repository.interface.js';

import { createPrismaJobRepository } from '../modules/jobs/infrastructure/prisma-job.repository.js';
import { createJobService, JobService } from '../modules/jobs/application/job.service.js';
import { createJobController, JobController } from '../modules/jobs/presentation/job.controller.js';
import { createJobRouter } from '../modules/jobs/presentation/job.routes.js';
import { IJobRepository } from '../modules/jobs/domain/job.repository.interface.js';
import { createIdempotencyMiddleware } from '../shared/middleware/idempotency.middleware.js';

import {
  createHealthController,
  HealthController,
} from '../modules/health/presentation/health.controller.js';
import { createHealthRouter } from '../modules/health/presentation/health.routes.js';

import { Router } from 'express';

export interface AppContainer {
  infrastructure: {
    prismaService: PrismaService;
    redisService: RedisService;
    queueService: BullMqQueueService;
    outboxDispatcher: OutboxDispatcher;
    workerRunner: WorkerRunner;
    notificationService: INotificationService;
  };
  services: {
    authService: AuthService;
    userService: UserService;
    jobService: JobService;
    tokenService: ITokenService;
    passwordHasher: IPasswordHasher;
  };
  repositories: {
    userRepository: IUserRepository;
    authSessionRepository: IAuthSessionRepository;
    jobRepository: IJobRepository;
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
  // 1. Infrastructure layer (lifecycle-managed services)
  const prismaService = new PrismaService();
  const redisService = new RedisService();
  const prismaClient = prismaService.getClient();
  const redisClient = redisService.getClient();

  const queueService = new BullMqQueueService(redisClient);
  const outboxDispatcher = new OutboxDispatcher(prismaClient, queueService);
  const notificationService = createLoggerNotificationService();

  // 2. Repositories (function-based adapters)
  const userRepository = createPrismaUserRepository(prismaClient);
  const authSessionRepository = createPrismaAuthSessionRepository(prismaClient);
  const jobRepository = createPrismaJobRepository(prismaClient);

  // 3. Worker runner (lifecycle-managed)
  const workerRunner = new WorkerRunner(redisClient, jobRepository, notificationService);

  // 4. Domain & Application services (function-based composition)
  const passwordHasher = createArgon2PasswordHasher();
  const tokenService = createJwtTokenService();

  const authService = createAuthService({
    userRepository,
    passwordHasher,
    tokenService,
    authSessionRepository,
  });

  const userService = createUserService({ userRepository });
  const jobService = createJobService({ jobRepository });

  // 5. Presentation layer (function-based controllers & router factories)
  const authController = createAuthController(authService);
  const userController = createUserController(userService);
  const jobController = createJobController(jobService);
  const healthController = createHealthController({ prismaService, redisService });

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

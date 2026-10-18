# Architecture Documentation

## 1. Architectural Philosophy and Clean Boundaries

This starter kit is designed as a **modular monolith** adhering to pragmatic **Clean Architecture** principles. It delivers strict separation of concerns, compile-time safety, explicit dependency injection, and operationally reliable background processing without relying on heavyweight dependency-injection containers or NestJS.

### Dependency Rules

- **Domain Layer (`domain/`)**: Pure business logic and domain interfaces. Must never import Express, Prisma, Redis, BullMQ, or third-party I/O libraries.
- **Application Layer (`application/`)**: Implements user use cases (e.g. `AuthService`, `UserService`, `JobService`). Depends only on domain abstractions and interfaces. Express request and response objects NEVER penetrate the application layer.
- **Infrastructure Layer (`infrastructure/`)**: Implements technical adapters (Prisma repositories, Redis connection, BullMQ queue, Pino logger, Argon2 hasher). Implements domain and application interfaces.
- **Presentation Layer (`presentation/`)**: HTTP controllers, middleware, input validation schemas (Zod), and routers. Translates incoming HTTP requests into application commands and formats application results into standard API responses.
- **Composition Root (`src/container/register-dependencies.ts`)**: Creates singletons, wires concrete adapters into services, and exposes an immutable `AppContainer`. Avoids hidden global service locators and circular dependencies.

```
       ┌────────────────────────────────────────────────────────┐
       │                   Presentation Layer                   │
       │     (Express Routes, Controllers, Middleware, Zod)     │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                   Application Layer                    │
       │           (AuthService, UserService, JobService)        │
       └──────────────┬──────────────────────────┬──────────────┘
                      │                          │
                      ▼                          ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │      Domain Layer      │      │     Infrastructure     │
       │ (Entities, Interfaces) │◄─────┤ (Prisma, Redis, BullMQ)│
       └────────────────────────┘      └────────────────────────┘
```

---

## 2. Directory Structure

```
src/
├── app.ts                               # Express application assembly & middleware pipeline
├── server.ts                            # API process entry point, DB/Redis verification, graceful shutdown
├── worker.ts                            # Independent background worker entry point
├── config/
│   ├── env.ts                           # Zod-validated environment configuration
│   └── logger.ts                        # Pino structured JSON logger with secret redaction
├── container/
│   └── register-dependencies.ts         # Explicit composition root / manual dependency injection
├── shared/
│   ├── errors/                          # Domain & application errors (AppError hierarchy)
│   ├── middleware/                      # Request ID, request logging, rate limiter, error handling, idempotency
│   ├── validation/                      # Zod schema request validation helper
│   └── types/                           # Common types, API response shapes, pagination, user context
├── infrastructure/
│   ├── database/                        # PrismaService client, health checks
│   ├── cache/                           # RedisService client, health checks
│   ├── queue/                           # BullMQ Queue, WorkerRunner, OutboxDispatcher
│   └── observability/
├── modules/
│   ├── auth/                            # Authentication, JWT, Argon2id, token rotation & reuse detection
│   ├── users/                           # Profile management, admin user listing, mass-assignment guards
│   ├── jobs/                            # Background jobs, durable persistence, transactional outbox
│   └── health/                          # Liveness (/health/live) and Readiness (/health/ready) probes
└── openapi/
    └── openapi.yaml                     # Complete OpenAPI 3.1 specification
```

---

## 3. Request Lifecycle

1. **Incoming HTTP Request**
2. **`requestIdMiddleware`**: Extracts `X-Request-Id` or generates a cryptographically random UUID v4 and binds it to `req.id` and the response header.
3. **`helmet`**: Sets defensive HTTP headers (HSTS, X-Content-Type-Options, Frameguard, etc.).
4. **`cors`**: Evaluates `Origin` header against explicit allowlist (`CORS_ORIGIN`).
5. **`requestLogger`**: Pino HTTP middleware logs the incoming request with sanitized headers.
6. **Body Parsers**: Express JSON and URL-encoded body parsers bounded to `1mb`.
7. **Rate Limiting**:
   - `standardRateLimiter`: Enforces global rate limits across API endpoints.
   - `authRateLimiter`: Strict window/attempt limit on sensitive endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`).
8. **Routing & Authentication**:
   - Routes grouped under `/api/v1/*`.
   - Protected endpoints invoke `createAuthMiddleware(tokenService)`.
   - Role-based operations invoke `authorize('ADMIN')`.
9. **`validateRequest`**: Validates `req.body`, `req.query`, and `req.params` against Zod schemas. Fails fast with `ValidationError` (400) if invalid.
10. **Controller & Application Service**: Controller delegates to application service.
11. **Idempotency Guard**: For endpoints supporting idempotency (`POST /api/v1/jobs`), `createIdempotencyMiddleware` evaluates `Idempotency-Key` and checks or caches database state.
12. **`errorHandlerMiddleware`**: Centralized handler catches any thrown error, maps it to stable error codes (`VALIDATION_ERROR`, `UNAUTHORIZED`, `CONFLICT`, `NOT_FOUND`), logs sanitized error metadata, and sends consistent JSON error responses.

---

## 4. Background Job & Transactional Outbox Lifecycle

### The Dual-Write Problem Solved

Directly enqueuing a job to Redis after persisting to PostgreSQL suffers from the dual-write failure window:

- If the application crashes or Redis is temporarily down after PostgreSQL commits, the job record is orphaned and never queued.
- If Redis enqueue occurs first, but the PostgreSQL commit fails, the worker processes a job that does not exist in the database.

### Our Outbox Solution

```
Client Request ──► JobService ──► [PostgreSQL Transaction]
                                  ├─ 1. INSERT INTO jobs (status='PENDING')
                                  └─ 2. INSERT INTO outbox_events (status='PENDING')
                                  COMMIT

OutboxDispatcher ──► [PostgreSQL Transaction]
                     SELECT * FROM outbox_events
                     WHERE status = 'PENDING'
                     FOR UPDATE SKIP LOCKED
                     ──► BullMQ.enqueue(stableJobId)
                     ──► UPDATE outbox_events SET status = 'PUBLISHED'
                     COMMIT

BullMQ Queue ──────► WorkerRunner
                     ├─ Verify Job in DB
                     ├─ Transition status: PROCESSING
                     ├─ Execute NotificationService
                     ├─ Transition status: COMPLETED (with result)
                     └─ On failure: Retries with exponential backoff; transitions to FAILED if maxAttempts exceeded
```

1. **Transactional Atomicity**: `PrismaJobRepository.createWithOutbox` creates the `Job` and `OutboxEvent` within a single `prisma.$transaction`.
2. **Concurrent Polling Safety**: `OutboxDispatcher` uses PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED`. Multiple API or worker instances can run dispatchers simultaneously without race conditions or duplicate dispatching.
3. **Queue Publication & Deduplication**: The outbox event is enqueued to BullMQ using the stable `aggregateId` (`jobId`). BullMQ enforces deduplication on stable IDs.
4. **Idempotent Worker Execution**: `WorkerRunner` checks if `job.status === 'COMPLETED'` before executing. Replays are cleanly ignored.
5. **Exponential Backoff**: BullMQ manages backoff retry delays. When a job fails, the database captures the attempt count and error message, transitioning to `FAILED` only when `attempts >= maxAttempts`.

---

## 5. Idempotency Architecture

- **Scope**: Idempotency keys are scoped to `(key, operation, userId)`.
- **Database Backing**: Stored in PostgreSQL `idempotency_records` table with a composite unique constraint `[key, operation, userId]`.
- **Payload Verification**: Computes a SHA-256 hash of the request body. If a request repeats the same key with different body payload, it is rejected with `409 IDEMPOTENCY_CONFLICT`.
- **Concurrent In-Flight Protection**: The record is initially inserted in `PROCESSING` status. Concurrent requests hitting the unique constraint immediately receive a `409` conflict indicating the operation is already in progress.
- **Replay**: Once `COMPLETED`, repeated requests receive the cached status code, headers, and cached response payload with `Idempotent-Replayed: true`.

---

## 6. Testing Boundaries

- **Unit Tests (`tests/unit/`)**: Pure fast unit tests using mock fakes for repositories, hashers, and token services. No database, Redis, or HTTP server required.
- **Integration Tests (`tests/integration/`)**: Validates real PostgreSQL transactions, row-level locks (`SKIP LOCKED`), BullMQ queues, Redis connections, and token rotation reuse detection.
- **End-to-End Tests (`tests/e2e/`)**: Exercises HTTP endpoints over Supertest through the full Express middleware pipeline, verifying authentication, authorization, validation, error mapping, and idempotency.

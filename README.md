# Express TypeScript Production Starter Kit

A robust, production-grade Express backend foundation built with **TypeScript**, **PostgreSQL**, **Prisma**, **Redis**, and **BullMQ**. It implements clean architecture boundaries, explicit dependency injection, transactional outbox background processing, idempotency guarantees, and enterprise security.

---

## What This Kit Is and Is Not

- **It IS**: A hardened engineering foundation designed for real products. It features strict TypeScript, short-lived JWT access tokens with rotating refresh tokens, token reuse detection, durable background processing via a transactional outbox with BullMQ, rate limiting, and centralized error handling.
- **It IS NOT**: A tutorial demo, a generic CRUD generator, or a NestJS clone. It avoids heavyweight DI frameworks, frontend dependencies, or microservice bloat.

---

## Technology Stack & Rationale

| Component            | Technology         | Rationale                                                             |
| -------------------- | ------------------ | --------------------------------------------------------------------- |
| **Runtime**          | Node.js 22+ / 24+  | Native ECMAScript Modules, high performance, active LTS support.      |
| **Language**         | TypeScript 5.7+    | Strict compiler configuration (`noImplicitAny`, `strictNullChecks`).  |
| **HTTP Framework**   | Express 4.x        | Battle-tested HTTP routing with minimal runtime overhead.             |
| **Database**         | PostgreSQL 16      | Relational consistency, row-level locking (`FOR UPDATE SKIP LOCKED`). |
| **ORM & Migrations** | Prisma 6.x         | Type-safe queries and committed SQL migrations.                       |
| **Queue**            | BullMQ & Redis 7   | High-performance distributed background job processing.               |
| **Validation**       | Zod                | Runtime schema validation and compile-time type inference.            |
| **Logging**          | Pino               | High-speed structured JSON logging with secret redaction.             |
| **Password Hashing** | Argon2id           | Memory-hard, timing-safe password hashing.                            |
| **Testing**          | Vitest & Supertest | Sub-second unit, integration, and end-to-end testing.                 |

---

## Architecture & Dependency Rules

1. **Domain Layer**: Contains domain entities and interfaces. Has zero dependencies on Express, Prisma, Redis, or BullMQ.
2. **Application Layer**: Contains business use cases (`AuthService`, `UserService`, `JobService`). Express request and response objects never enter this layer.
3. **Infrastructure Layer**: Implements technical adapters (`PrismaUserRepository`, `BullMqQueueService`, `RedisService`).
4. **Presentation Layer**: Express controllers, routes, and middleware.
5. **Composition Root (`src/container/register-dependencies.ts`)**: Pure constructor injection without hidden global service locators.

---

## Prerequisites

- **Node.js** >= 20 (Node 22 or 24 recommended)
- **Docker** & **Docker Compose**
- **npm** >= 10

---

## Quickstart & Local Setup

### 1. Clone & Install Dependencies

```bash
git clone <repo-url> express-starter
cd express-starter
npm install
```

### 2. Configure Environment Variables

Copy the template `.env.example` to `.env`:

```bash
cp .env.example .env
```

### 3. Start Local Infrastructure (PostgreSQL & Redis)

```bash
npm run docker:up
```

### 4. Apply Database Migrations & Seed Data

```bash
# Apply migrations to local PostgreSQL
npm run prisma:migrate

# Seed development users (admin and standard user)
npm run prisma:seed
```

Default seeded accounts:

- **Admin**: `admin@starter.dev` / `AdminPassword123!`
- **User**: `user@starter.dev` / `UserPassword123!`

### 5. Start the Application

Start the **API Server** and **Background Worker** in separate terminals:

```bash
# Terminal 1 - API Server (Runs on port 3000)
npm run dev

# Terminal 2 - Background Worker
npm run dev:worker
```

---

## Available Scripts

| Script                     | Command                        | Purpose                                  |
| -------------------------- | ------------------------------ | ---------------------------------------- |
| `npm run dev`              | `tsx watch src/server.ts`      | Start API server in watch mode           |
| `npm run dev:worker`       | `tsx watch src/worker.ts`      | Start background worker in watch mode    |
| `npm run build`            | `tsc -p tsconfig.build.json`   | Compile TypeScript to `dist/`            |
| `npm run start`            | `node dist/src/server.js`      | Run compiled production API server       |
| `npm run start:worker`     | `node dist/src/worker.js`      | Run compiled production worker           |
| `npm run typecheck`        | `tsc --noEmit`                 | Run strict TypeScript checks             |
| `npm run lint`             | `eslint .`                     | Lint codebase with ESLint 9              |
| `npm run format`           | `prettier --check ...`         | Verify code formatting                   |
| `npm run format:fix`       | `prettier --write ...`         | Automatically format files               |
| `npm run test`             | `vitest run`                   | Run all unit, integration, and E2E tests |
| `npm run test:unit`        | `vitest run tests/unit`        | Run unit tests                           |
| `npm run test:integration` | `vitest run tests/integration` | Run database and queue integration tests |
| `npm run test:e2e`         | `vitest run tests/e2e`         | Run Supertest HTTP API tests             |
| `npm run prisma:migrate`   | `prisma migrate dev`           | Apply migrations in development          |
| `npm run prisma:seed`      | `tsx prisma/seed.ts`           | Seed database                            |

---

## API Endpoints & Usage

### Response Conventions

#### Success

```json
{
  "data": { ... },
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

#### Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload is invalid",
    "requestId": "2e7a1fc5-2c82-4f35-9610-ea0443a91b40",
    "details": [{ "field": "email", "message": "Invalid email address" }]
  }
}
```

### Key Routes

| Method  | Path                    | Auth                  | Description                                        |
| ------- | ----------------------- | --------------------- | -------------------------------------------------- |
| `GET`   | `/api/v1/health/live`   | Public                | Liveness probe (200 UP)                            |
| `GET`   | `/api/v1/health/ready`  | Public                | Readiness probe (verifies DB & Redis)              |
| `POST`  | `/api/v1/auth/register` | Public (Rate-limited) | Register new user account                          |
| `POST`  | `/api/v1/auth/login`    | Public (Rate-limited) | Login & receive access + refresh token             |
| `POST`  | `/api/v1/auth/refresh`  | Public (Rate-limited) | Rotate refresh token                               |
| `POST`  | `/api/v1/auth/logout`   | Public                | Revoke refresh token                               |
| `GET`   | `/api/v1/auth/me`       | Bearer Token          | Authenticated user profile                         |
| `GET`   | `/api/v1/users/me`      | Bearer Token          | Authenticated user profile                         |
| `PATCH` | `/api/v1/users/me`      | Bearer Token          | Update firstName, lastName                         |
| `GET`   | `/api/v1/users`         | Admin Role            | Paginated list of users                            |
| `POST`  | `/api/v1/jobs`          | Bearer Token          | Submit background job (supports `Idempotency-Key`) |
| `GET`   | `/api/v1/jobs`          | Bearer Token          | Paginated list of jobs                             |
| `GET`   | `/api/v1/jobs/:id`      | Bearer Token          | Retrieve job state and execution result            |

---

## Background Processing & Reliability

### Transactional Outbox Pattern

To prevent lost jobs during server crashes or Redis unavailability, the starter kit uses a **Transactional Outbox**:

1. When `POST /api/v1/jobs` is called, the `Job` and an `OutboxEvent` are written to PostgreSQL inside a single database transaction (`prisma.$transaction`).
2. An `OutboxDispatcher` periodically polls pending events using `SELECT ... FOR UPDATE SKIP LOCKED`.
3. The dispatcher publishes events to BullMQ using the stable `jobId` and marks the outbox event `PUBLISHED`.
4. Multiple dispatcher instances can run simultaneously across replica containers without race conditions.

### Idempotency

`POST /api/v1/jobs` supports the `Idempotency-Key` HTTP header:

- Unique keys are tracked in PostgreSQL (`idempotency_records`).
- Retrying with the same key and payload returns the cached result with header `Idempotent-Replayed: true`.
- Reusing the same key with a different payload returns `409 IDEMPOTENCY_CONFLICT`.

---

## Docker Production Deployment

Build and run the production image:

```bash
# Build multi-stage image
docker build -t express-starter:latest .

# Run container (runs as unprivileged non-root user nodejs)
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name express_api \
  express-starter:latest
```

---

## Known Limitations & Production Enhancements

1. **Email / SMS Adapter**: The starter kit includes `LoggerNotificationService` for development and testing. To send real emails or SMS, implement `INotificationService` using SendGrid, SES, or Twilio.
2. **Horizontal Redis Scaling**: The current Redis configuration is single-node. For mission-critical high availability, configure AWS ElastiCache or Redis Sentinel.
3. **SSRF Protections**: If jobs are extended to make outbound HTTP requests to user-provided webhook URLs, route outbound traffic through a proxy restricting access to RFC 1918 private subnets.

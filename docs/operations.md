# Operations & Runbook

## 1. Process Architecture

The system consists of two primary operational components:

1. **API Server (`src/server.ts` / `dist/src/server.js`)**:
   - Handles HTTP API traffic under `/api/v1/*`.
   - Runs database and Redis readiness checks before opening ports.
   - Hosts the `OutboxDispatcher` to poll pending PostgreSQL events and enqueue to BullMQ.
2. **Background Worker (`src/worker.ts` / `dist/src/worker.js`)**:
   - Long-running BullMQ worker consumer.
   - Listens on Redis queue `app-jobs` with configurable concurrency.
   - Updates authoritative PostgreSQL job state on start, retry, completion, or failure.

---

## 2. Startup & Bootstrapping

### Step 1: Environment Variables

Ensure all required environment variables are configured. The application validates variables using Zod at process start and exits immediately with exit code `1` if required values are missing.

### Step 2: Database Migrations

Always run migrations before starting the application processes:

```bash
# In production / CI (non-destructive, applies committed migrations)
npx prisma migrate deploy

# In development (generates and applies migrations interactively)
npm run prisma:migrate
```

### Step 3: Starting the API Server

```bash
# Production:
npm run start
# or: node dist/src/server.js

# Development (with watch reload):
npm run dev
```

### Step 4: Starting the Worker Process

```bash
# Production:
npm run start:worker
# or: node dist/src/worker.js

# Development (with watch reload):
npm run dev:worker
```

---

## 3. Health Checks & Probes

| Endpoint               | Method | Purpose                    | Response Expected                                      |
| ---------------------- | ------ | -------------------------- | ------------------------------------------------------ |
| `/api/v1/health/live`  | `GET`  | Process liveness probe     | `200 OK` `{"status":"UP","timestamp":"..."}`           |
| `/api/v1/health/ready` | `GET`  | Dependency readiness probe | `200 OK` (or `503 Unavailable` if DB or Redis is down) |

### Sample Readiness Response (Healthy)

```json
{
  "status": "UP",
  "timestamp": "2026-10-18T22:00:00.000Z",
  "checks": {
    "database": "UP",
    "redis": "UP"
  }
}
```

### Sample Readiness Response (Degraded)

```json
{
  "status": "DOWN",
  "timestamp": "2026-10-18T22:00:00.000Z",
  "checks": {
    "database": "UP",
    "redis": "DOWN"
  }
}
```

---

## 4. Graceful Shutdown & Draining

Both the API server and worker implement coordinated graceful shutdown upon receiving `SIGTERM` or `SIGINT`:

1. **Stop Incoming Work**:
   - API stops accepting new HTTP connections via `server.close()`.
   - Worker pauses consuming new queue items via `worker.close()`.
2. **Drain In-Flight Work**:
   - In-flight requests are allowed up to `SHUTDOWN_TIMEOUT_MS` (default 10s) to complete.
3. **Resource Cleanup**:
   - Stop `OutboxDispatcher` timers.
   - Close BullMQ queues.
   - Disconnect `RedisService` (`quit()`).
   - Disconnect `PrismaService` (`$disconnect()`).
4. **Hard Timeout Protection**:
   - An unref'd timer forces exit with code `1` if resources take longer than `SHUTDOWN_TIMEOUT_MS`.

---

## 5. Failure Recovery & Troubleshooting

### Scenario: Database Temporarily Down

- **Behavior**: Readiness probe `/api/v1/health/ready` returns `503`. Requests requiring persistence fail with `500 INTERNAL_SERVER_ERROR`.
- **Recovery**: Once PostgreSQL recovers, Prisma automatically reconnects on the next query. Readiness probe immediately returns `200`.

### Scenario: Redis Temporarily Down

- **Behavior**: API can still accept job submissions because jobs are written to PostgreSQL outbox first!
- **Recovery**: `OutboxDispatcher` catches connection errors, logs them, and automatically retries publishing on the next interval once Redis is available. Zero job submissions are lost.

### Scenario: Job Repeatedly Fails in Worker

- **Behavior**: Worker attempts the job up to `maxAttempts` (default 3) using exponential backoff.
- **Outcome**: When `attempts >= maxAttempts`, the job status in PostgreSQL is marked `FAILED` with the exact error message in `job.error`, and BullMQ moves it to the dead-letter queue.
- **Inspection**: Query PostgreSQL `jobs` where `status = 'FAILED'`.

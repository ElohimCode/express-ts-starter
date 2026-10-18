# Security Architecture and Controls

## 1. Security Baseline Overview

This document outlines the security controls implemented directly in the starter kit codebase, as well as the operational responsibilities required in production deployment.

---

## 2. Implemented Security Controls

### 2.1 Password Hashing with Argon2id

- **Algorithm**: `Argon2id` (the winner of the Password Hashing Competition, resistant to GPU/ASIC attacks and side-channel timing attacks).
- **Configuration**:
  - Memory cost: 65,536 KiB (64 MB)
  - Time cost: 3 iterations
  - Parallelism: 4 threads
- **Verification**: Uses constant-time internal verification provided by the native Argon2 library.

### 2.2 Token Lifecycle & Refresh Token Rotation

- **Access Tokens**:
  - Format: Signed JWT (HS256).
  - Lifetime: Configurable short lifetime (`15m` default).
  - Claims validation: Verifies `exp`, `nbf`, `iss` (`JWT_ISSUER`), and `aud` (`JWT_AUDIENCE`).
- **Refresh Tokens**:
  - Generation: Cryptographically secure pseudo-random bytes (`crypto.randomBytes(40).toString('hex')`).
  - Storage: Only a **SHA-256 hash** of the refresh token is stored in PostgreSQL (`token_hash`), preventing replay attacks in the event of database exfiltration.
  - **Rotation**: On every refresh request, the existing token session is marked revoked and a newly generated refresh token is issued.
  - **Token Reuse Detection (Family Revocation)**: If a client presents a refresh token whose database session is already marked `is_revoked: true`, the system recognizes a replay/theft event and immediately revokes **all** active sessions belonging to that user.

### 2.3 Defense Against User Enumeration & Timing Attacks

- Authentication endpoints (`/api/v1/auth/login`) return the generic error `"Invalid email or password"` whether the user was not found or the password was incorrect.
- Responses never distinguish between non-existent emails and wrong credentials.

### 2.4 Rate Limiting & Brute Force Protection

- **Global Standard Rate Limiter**: Configurable via `RATE_LIMIT_WINDOW_MS` (default 60s) and `RATE_LIMIT_MAX` (default 100 requests).
- **Strict Authentication Limiter**: Applied to sensitive endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`), enforcing a 15-minute window with a default ceiling of 10 requests.

### 2.5 Request Validation & Mass-Assignment Prevention

- **Zod Schema Validation**: All request bodies, URL query parameters, and route parameters are validated before reaching application services. Unknown or unexpected properties are stripped or rejected.
- **Mass-Assignment Guard**: User update operations (`PATCH /api/v1/users/me`) explicitly destructure only allowed fields (`firstName`, `lastName`). Administrative properties like `role`, `isActive`, `email`, or `passwordHash` cannot be modified through profile endpoints.

### 2.6 HTTP Security Headers & CORS

- **Helmet**: Configures defensive HTTP response headers:
  - `Strict-Transport-Security` (HSTS): Max-age 1 year.
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-XSS-Protection: 0` (modern standard per OWASP)
  - Referrer policy and DNS prefetch controls.
- **CORS**:
  - Whitelist origins configured strictly via comma-separated `CORS_ORIGIN` in environment.
  - Explicitly allowed headers and HTTP methods.

### 2.7 Structured Logging & Secret Redaction

- Pino structured JSON logging is configured with automated redaction filters:
  - `req.headers.authorization`
  - `req.headers.cookie`
  - `req.body.password`
  - `req.body.refreshToken`
  - `password`, `token`, `secret`, `refreshToken`
- Logs never print plain credentials, secrets, or raw authorization headers.

### 2.8 Least-Privilege Runtime & Docker Security

- Multi-stage Dockerfile builds the application without devDependencies.
- Runtime container runs under a dedicated, unprivileged system user (`nodejs`, UID/GID 10001).
- No root processes inside the container.

---

## 3. Operational & Deployment Responsibilities

While the starter kit enforces application-layer security, production deployments must configure the following operational controls:

1. **TLS / HTTPS Termination**: The application assumes TLS is terminated by an ingress controller, reverse proxy (e.g. Nginx, Cloudflare), or cloud load balancer.
2. **Proxy Trust Configuration**: Set `TRUST_PROXY=true` only when running behind a trusted reverse proxy that rewrites `X-Forwarded-For`.
3. **Secret Rotation**: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be set to unique, high-entropy secrets (at least 32 characters) using a secure secret manager (e.g. AWS Secrets Manager, HashiCorp Vault).
4. **Database Network Isolation**: PostgreSQL and Redis should only be reachable via private networks / VPC, never exposed to public internet ingress.
5. **SSRF Protections**: If background jobs or notification adapters are extended to trigger arbitrary outbound webhooks, enforce an outbound HTTP proxy that blocks RFC 1918 private subnets and cloud metadata IPs (`169.254.169.254`).

import { ApiErrorDetail } from '../types/index.js';

export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;
  public readonly details?: ApiErrorDetail[];
  public readonly isOperational: boolean;

  constructor(message: string, details?: ApiErrorDetail[], isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly statusCode = 400;
  public readonly code = 'VALIDATION_ERROR';

  constructor(message = 'The request payload is invalid', details?: ApiErrorDetail[]) {
    super(message, details);
  }
}

export class UnauthorizedError extends AppError {
  public readonly statusCode = 401;
  public readonly code = 'UNAUTHORIZED';

  constructor(message = 'Authentication is required') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  public readonly statusCode = 403;
  public readonly code = 'FORBIDDEN';

  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  public readonly statusCode = 404;
  public readonly code = 'NOT_FOUND';

  constructor(message = 'The requested resource was not found') {
    super(message);
  }
}

export class ConflictError extends AppError {
  public readonly statusCode = 409;
  public readonly code = 'CONFLICT';

  constructor(message = 'The resource already exists or is in a conflicting state') {
    super(message);
  }
}

export class IdempotencyConflictError extends AppError {
  public readonly statusCode = 409;
  public readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor(
    message = 'An operation with this idempotency key is already in progress or completed with different payload'
  ) {
    super(message);
  }
}

export class TooManyRequestsError extends AppError {
  public readonly statusCode = 429;
  public readonly code = 'TOO_MANY_REQUESTS';

  constructor(message = 'Rate limit exceeded, please try again later') {
    super(message);
  }
}

export class InternalServerError extends AppError {
  public readonly statusCode = 500;
  public readonly code = 'INTERNAL_SERVER_ERROR';

  constructor(message = 'An unexpected internal error occurred') {
    super(message, undefined, false);
  }
}

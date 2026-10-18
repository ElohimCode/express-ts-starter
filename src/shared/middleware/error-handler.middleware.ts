import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { ApiErrorResponse } from '../types/index.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id ? String(req.id) : (req.headers['x-request-id'] as string) || undefined;

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: ApiErrorResponse['error']['details'] = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      code = 'CONFLICT';
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      message = `A resource with this ${target} already exists`;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'The requested resource was not found';
    } else {
      statusCode = 400;
      code = 'DATABASE_REQUEST_ERROR';
      message = 'Database operation failed';
    }
  } else if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status: number }).status === 400
  ) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Request body contains malformed JSON';
  } else if (err instanceof Error) {
    // Unknown unhandled error
    if (env.NODE_ENV !== 'production') {
      message = err.message;
    }
  }

  // Structured logging of errors
  const logContext = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    code,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  };

  if (statusCode >= 500) {
    logger.error(logContext, `Server error: ${message}`);
  } else {
    logger.warn(logContext, `Client error: ${message}`);
  }

  const responseBody: ApiErrorResponse = {
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
  };

  res.status(statusCode).json(responseBody);
}

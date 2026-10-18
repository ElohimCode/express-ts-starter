import { Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../../config/logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req: Request) => req.id || req.headers['x-request-id']?.toString() || 'unknown',
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req: Request, res: Response) =>
    `${req.method} ${req.url} completed with ${res.statusCode}`,
  customErrorMessage: (req: Request, res: Response, err: Error) =>
    `${req.method} ${req.url} failed with ${res.statusCode}: ${err.message}`,
  autoLogging: {
    ignore: (req) => req.url?.startsWith('/api/v1/health/live') || false,
  },
});

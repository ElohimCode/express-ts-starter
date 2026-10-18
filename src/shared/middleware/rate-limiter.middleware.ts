import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { TooManyRequestsError } from '../errors/app-error.js';

export const standardRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError('Too many requests, please try again later'));
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: env.AUTH_RATE_LIMIT_MAX, // e.g. 10 attempts
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new TooManyRequestsError(
        'Too many authentication attempts, please try again after 15 minutes'
      )
    );
  },
});

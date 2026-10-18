import { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { PrismaClient, IdempotencyStatus } from '@prisma/client';
import { IdempotencyConflictError } from '../errors/app-error.js';
import { logger } from '../../config/logger.js';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export function createIdempotencyMiddleware(
  prisma: PrismaClient,
  operation: string,
  retentionHours = 24
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = req.headers[IDEMPOTENCY_KEY_HEADER] || req.headers['x-idempotency-key'];

    if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
      // No idempotency key provided; proceed normally
      return next();
    }

    const key = rawKey.trim();
    const userId = req.user?.id || null;
    const bodyString = JSON.stringify(req.body || {});
    const requestHash = createHash('sha256').update(bodyString).digest('hex');
    const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);

    try {
      // Check existing record
      const existing = await prisma.idempotencyRecord.findFirst({
        where: {
          key,
          operation,
          userId,
        },
      });

      if (existing) {
        // Verify payload hash
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyConflictError(
            'Idempotency key has already been used with a different request payload'
          );
        }

        if (existing.status === IdempotencyStatus.PROCESSING) {
          throw new IdempotencyConflictError(
            'An operation with this idempotency key is currently being processed. Please retry later.'
          );
        }

        if (existing.status === IdempotencyStatus.COMPLETED && existing.responseBody) {
          // Replay cached response
          res.setHeader('Idempotent-Replayed', 'true');
          res.status(existing.statusCode || 200).json(existing.responseBody);
          return;
        }
      }

      // Claim key by creating record in PROCESSING state
      const record = await prisma.idempotencyRecord.create({
        data: {
          key,
          userId,
          operation,
          requestHash,
          status: IdempotencyStatus.PROCESSING,
          expiresAt,
        },
      });

      // Intercept response to persist outcome
      const originalJson = res.json.bind(res);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.json = function (body: any) {
        const statusCode = res.statusCode;
        // Run update asynchronously
        if (statusCode >= 200 && statusCode < 300) {
          prisma.idempotencyRecord
            .update({
              where: { id: record.id },
              data: {
                status: IdempotencyStatus.COMPLETED,
                statusCode,
                responseBody: body,
              },
            })
            .catch((err) => {
              logger.error(
                { err, idempotencyKey: key },
                'Failed to save completed idempotency state'
              );
            });
        } else {
          prisma.idempotencyRecord
            .update({
              where: { id: record.id },
              data: {
                status: IdempotencyStatus.FAILED,
                statusCode,
                responseBody: body,
              },
            })
            .catch((err) => {
              logger.error({ err, idempotencyKey: key }, 'Failed to save failed idempotency state');
            });
        }

        return originalJson(body);
      };

      next();
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        // Unique constraint violation due to concurrent request
        return next(
          new IdempotencyConflictError('Concurrent request detected with the same idempotency key')
        );
      }
      next(err);
    }
  };
}

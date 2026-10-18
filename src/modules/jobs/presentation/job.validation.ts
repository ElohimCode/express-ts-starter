import { z } from 'zod';
import { JOB_TYPES } from '../infrastructure/queue.constants.js';

export const submitJobSchema = z.object({
  type: z.nativeEnum(JOB_TYPES, {
    errorMap: () => ({
      message: `Invalid job type. Supported types: ${Object.values(JOB_TYPES).join(', ')}`,
    }),
  }),
  payload: z.record(z.unknown()).refine((val) => Object.keys(val).length > 0, {
    message: 'Job payload cannot be empty',
  }),
  maxAttempts: z.number().int().min(1).max(10).optional().default(3),
});

export const jobIdParamSchema = z.object({
  id: z.string().uuid('Invalid job ID format'),
});

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

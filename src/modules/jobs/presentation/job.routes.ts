import { Router, RequestHandler } from 'express';
import { JobController } from './job.controller.js';
import { validateRequest } from '../../../shared/validation/validate.js';
import { submitJobSchema, jobIdParamSchema, listJobsQuerySchema } from './job.validation.js';

export function createJobRouter(
  jobController: JobController,
  authenticate: RequestHandler,
  idempotencyMiddleware: RequestHandler
): Router {
  const router = Router();

  // All job routes require authentication
  router.use(authenticate);

  router.post(
    '/',
    idempotencyMiddleware,
    validateRequest({ body: submitJobSchema }),
    jobController.submitJob
  );

  router.get('/', validateRequest({ query: listJobsQuerySchema }), jobController.listJobs);

  router.get('/:id', validateRequest({ params: jobIdParamSchema }), jobController.getJobById);

  return router;
}

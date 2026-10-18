import { RequestHandler } from 'express';
import { JobService } from '../application/job.service.js';
import { ApiResponse } from '../../../shared/types/index.js';
import { JobEntity } from '../domain/job.entity.js';

export interface JobController {
  submitJob: RequestHandler;
  getJobById: RequestHandler;
  listJobs: RequestHandler;
}

export function createJobController(jobService: JobService): JobController {
  const submitJob: RequestHandler = async (req, res, next) => {
    try {
      const { type, payload, maxAttempts } = req.body;
      const userId = req.user?.id || null;

      const job = await jobService.submitJob({
        type,
        payload,
        userId,
        maxAttempts,
      });

      const response: ApiResponse<JobEntity> = {
        data: job,
      };

      res.status(202).json(response);
    } catch (err) {
      next(err);
    }
  };

  const getJobById: RequestHandler = async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const userId = req.user?.id;
      const role = req.user?.role;

      const job = await jobService.getJobById(id, userId, role);

      const response: ApiResponse<JobEntity> = {
        data: job,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  const listJobs: RequestHandler = async (req, res, next) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const userId = req.user?.id;
      const role = req.user?.role;

      const result = await jobService.listJobs({ page, limit }, userId, role);

      const response: ApiResponse<JobEntity[]> = {
        data: result.items,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  return {
    submitJob,
    getJobById,
    listJobs,
  };
}

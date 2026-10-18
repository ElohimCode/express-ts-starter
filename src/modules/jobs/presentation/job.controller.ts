import { Request, Response, NextFunction } from 'express';
import { JobService } from '../application/job.service.js';
import { ApiResponse } from '../../../shared/types/index.js';
import { JobEntity } from '../domain/job.entity.js';

export class JobController {
  constructor(private readonly jobService: JobService) {}

  submitJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { type, payload, maxAttempts } = req.body;
      const userId = req.user?.id || null;

      const job = await this.jobService.submitJob({
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

  getJobById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const userId = req.user?.id;
      const role = req.user?.role;

      const job = await this.jobService.getJobById(id, userId, role);

      const response: ApiResponse<JobEntity> = {
        data: job,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  listJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const userId = req.user?.id;
      const role = req.user?.role;

      const result = await this.jobService.listJobs({ page, limit }, userId, role);

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
}

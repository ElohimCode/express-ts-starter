import { IJobRepository } from '../domain/job.repository.interface.js';
import { JobEntity, SubmitJobInput } from '../domain/job.entity.js';
import { NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export class JobService {
  constructor(private readonly jobRepository: IJobRepository) {}

  async submitJob(input: SubmitJobInput): Promise<JobEntity> {
    const result = await this.jobRepository.createWithOutbox(input);
    return result.job;
  }

  async getJobById(
    id: string,
    requestingUserId?: string,
    userRole?: 'USER' | 'ADMIN'
  ): Promise<JobEntity> {
    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new NotFoundError('Job not found');
    }

    // Authorization check: non-admins can only see their own jobs
    if (userRole !== 'ADMIN' && job.userId && job.userId !== requestingUserId) {
      throw new ForbiddenError('You are not authorized to view this job');
    }

    return job;
  }

  async listJobs(
    params: PaginationParams,
    requestingUserId?: string,
    userRole?: 'USER' | 'ADMIN'
  ): Promise<PaginatedResult<JobEntity>> {
    // Non-admins only see their own jobs
    const scopedUserId = userRole === 'ADMIN' ? null : requestingUserId;
    return this.jobRepository.findAll(params, scopedUserId);
  }
}

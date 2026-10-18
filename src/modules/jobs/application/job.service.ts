import { IJobRepository } from '../domain/job.repository.interface.js';
import { JobEntity, SubmitJobInput } from '../domain/job.entity.js';
import { NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export interface JobServiceDependencies {
  jobRepository: IJobRepository;
}

export interface JobService {
  submitJob(input: SubmitJobInput): Promise<JobEntity>;
  getJobById(
    id: string,
    requestingUserId?: string,
    userRole?: 'USER' | 'ADMIN'
  ): Promise<JobEntity>;
  listJobs(
    params: PaginationParams,
    requestingUserId?: string,
    userRole?: 'USER' | 'ADMIN'
  ): Promise<PaginatedResult<JobEntity>>;
}

export function createJobService(dependencies: JobServiceDependencies): JobService {
  const { jobRepository } = dependencies;

  async function submitJob(input: SubmitJobInput): Promise<JobEntity> {
    const result = await jobRepository.createWithOutbox(input);
    return result.job;
  }

  async function getJobById(
    id: string,
    requestingUserId?: string,
    userRole?: 'USER' | 'ADMIN'
  ): Promise<JobEntity> {
    const job = await jobRepository.findById(id);
    if (!job) {
      throw new NotFoundError('Job not found');
    }

    // Authorization check: non-admins can only see their own jobs
    if (userRole !== 'ADMIN' && job.userId && job.userId !== requestingUserId) {
      throw new ForbiddenError('You are not authorized to view this job');
    }

    return job;
  }

  async function listJobs(
    params: PaginationParams,
    requestingUserId?: string,
    userRole?: 'USER' | 'ADMIN'
  ): Promise<PaginatedResult<JobEntity>> {
    const scopedUserId = userRole === 'ADMIN' ? null : requestingUserId;
    return jobRepository.findAll(params, scopedUserId);
  }

  return {
    submitJob,
    getJobById,
    listJobs,
  };
}

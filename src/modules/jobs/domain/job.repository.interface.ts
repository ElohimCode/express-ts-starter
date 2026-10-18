import { JobEntity, JobStatus, SubmitJobInput } from './job.entity.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export interface CreateJobWithOutboxResult {
  job: JobEntity;
  outboxEventId: string;
}

export interface IJobRepository {
  createWithOutbox(input: SubmitJobInput): Promise<CreateJobWithOutboxResult>;
  findById(id: string): Promise<JobEntity | null>;
  updateStatus(
    id: string,
    status: JobStatus,
    data?: {
      result?: Record<string, unknown> | null;
      error?: string | null;
      attempts?: number;
      startedAt?: Date | null;
      completedAt?: Date | null;
    }
  ): Promise<JobEntity>;
  findAll(params: PaginationParams, userId?: string | null): Promise<PaginatedResult<JobEntity>>;
}

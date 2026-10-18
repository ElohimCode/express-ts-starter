import {
  PrismaClient,
  Job as PrismaJob,
  Prisma,
  JobStatus as PrismaJobStatus,
} from '@prisma/client';
import { IJobRepository, CreateJobWithOutboxResult } from '../domain/job.repository.interface.js';
import { JobEntity, JobStatus, SubmitJobInput } from '../domain/job.entity.js';
import { PaginatedResult, PaginationParams } from '../../../shared/types/index.js';

export function createPrismaJobRepository(prisma: PrismaClient): IJobRepository {
  function mapToEntity(job: PrismaJob): JobEntity {
    return {
      id: job.id,
      type: job.type,
      status: job.status as JobStatus,
      payload: (job.payload as Record<string, unknown>) || {},
      result: (job.result as Record<string, unknown>) || null,
      error: job.error,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      userId: job.userId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  async function createWithOutbox(input: SubmitJobInput): Promise<CreateJobWithOutboxResult> {
    return prisma.$transaction(async (tx) => {
      // 1. Create Job in database
      const job = await tx.job.create({
        data: {
          type: input.type,
          status: PrismaJobStatus.PENDING,
          payload: input.payload as Prisma.InputJsonValue,
          userId: input.userId || null,
          maxAttempts: input.maxAttempts || 3,
        },
      });

      // 2. Persist outbox event in the EXACT SAME transaction
      const outbox = await tx.outboxEvent.create({
        data: {
          aggregateType: 'JOB',
          aggregateId: job.id,
          eventType: 'JOB_SUBMITTED',
          payload: {
            jobId: job.id,
            type: job.type,
            payload: input.payload,
            maxAttempts: job.maxAttempts,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        job: mapToEntity(job),
        outboxEventId: outbox.id,
      };
    });
  }

  async function findById(id: string): Promise<JobEntity | null> {
    const job = await prisma.job.findUnique({
      where: { id },
    });
    return job ? mapToEntity(job) : null;
  }

  async function updateStatus(
    id: string,
    status: JobStatus,
    data?: {
      result?: Record<string, unknown> | null;
      error?: string | null;
      attempts?: number;
      startedAt?: Date | null;
      completedAt?: Date | null;
    }
  ): Promise<JobEntity> {
    const updateData: Prisma.JobUpdateInput = {
      status: status as PrismaJobStatus,
      ...(data?.result !== undefined
        ? { result: (data.result as Prisma.InputJsonValue) ?? Prisma.JsonNull }
        : {}),
      ...(data?.error !== undefined ? { error: data.error } : {}),
      ...(data?.attempts !== undefined ? { attempts: data.attempts } : {}),
      ...(data?.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
      ...(data?.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
    };

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
    });

    return mapToEntity(job);
  }

  async function findAll(
    params: PaginationParams,
    userId?: string | null
  ): Promise<PaginatedResult<JobEntity>> {
    const page = Math.max(1, params.page);
    const limit = Math.max(1, Math.min(100, params.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = userId ? { userId } : {};

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: jobs.map(mapToEntity),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  return {
    createWithOutbox,
    findById,
    updateStatus,
    findAll,
  };
}

// Preserve class alias for backwards compatibility
export class PrismaJobRepository {
  private repo: IJobRepository;
  constructor(prisma: PrismaClient) {
    this.repo = createPrismaJobRepository(prisma);
  }
  createWithOutbox(input: SubmitJobInput) {
    return this.repo.createWithOutbox(input);
  }
  findById(id: string) {
    return this.repo.findById(id);
  }
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
  ) {
    return this.repo.updateStatus(id, status, data);
  }
  findAll(params: PaginationParams, userId?: string | null) {
    return this.repo.findAll(params, userId);
  }
}

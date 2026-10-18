import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobService } from '../../src/modules/jobs/application/job.service.js';
import { IJobRepository } from '../../src/modules/jobs/domain/job.repository.interface.js';
import { NotFoundError, ForbiddenError } from '../../src/shared/errors/app-error.js';

describe('JobService (Unit)', () => {
  let jobService: JobService;
  let mockJobRepo: IJobRepository;

  beforeEach(() => {
    mockJobRepo = {
      createWithOutbox: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      findAll: vi.fn(),
    };

    jobService = new JobService(mockJobRepo);
  });

  describe('submitJob', () => {
    it('persists job via repository and returns created job', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'SEND_NOTIFICATION',
        status: 'PENDING' as const,
        payload: { recipient: 'user@example.com' },
        result: null,
        error: null,
        attempts: 0,
        maxAttempts: 3,
        userId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockJobRepo.createWithOutbox).mockResolvedValue({
        job: mockJob,
        outboxEventId: 'outbox-456',
      });

      const result = await jobService.submitJob({
        type: 'SEND_NOTIFICATION',
        payload: { recipient: 'user@example.com' },
        userId: 'u1',
      });

      expect(result.id).toBe('job-123');
      expect(result.status).toBe('PENDING');
      expect(mockJobRepo.createWithOutbox).toHaveBeenCalledWith({
        type: 'SEND_NOTIFICATION',
        payload: { recipient: 'user@example.com' },
        userId: 'u1',
      });
    });
  });

  describe('getJobById', () => {
    it('throws NotFoundError if job does not exist', async () => {
      vi.mocked(mockJobRepo.findById).mockResolvedValue(null);

      await expect(jobService.getJobById('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('allows owner to view their job', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'SEND_NOTIFICATION',
        status: 'COMPLETED' as const,
        payload: {},
        result: { delivered: true },
        error: null,
        attempts: 1,
        maxAttempts: 3,
        userId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockJobRepo.findById).mockResolvedValue(mockJob);

      const result = await jobService.getJobById('job-123', 'u1', 'USER');
      expect(result.id).toBe('job-123');
    });

    it('prevents non-owner non-admin from viewing another user job', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'SEND_NOTIFICATION',
        status: 'COMPLETED' as const,
        payload: {},
        result: null,
        error: null,
        attempts: 1,
        maxAttempts: 3,
        userId: 'owner-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockJobRepo.findById).mockResolvedValue(mockJob);

      await expect(jobService.getJobById('job-123', 'other-user', 'USER')).rejects.toThrow(
        ForbiddenError
      );
    });

    it('allows admin to view any user job', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'SEND_NOTIFICATION',
        status: 'COMPLETED' as const,
        payload: {},
        result: null,
        error: null,
        attempts: 1,
        maxAttempts: 3,
        userId: 'owner-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockJobRepo.findById).mockResolvedValue(mockJob);

      const result = await jobService.getJobById('job-123', 'admin-id', 'ADMIN');
      expect(result.id).toBe('job-123');
    });
  });
});

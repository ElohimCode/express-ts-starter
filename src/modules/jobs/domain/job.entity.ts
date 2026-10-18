export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface JobEntity {
  id: string;
  type: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attempts: number;
  maxAttempts: number;
  userId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface SubmitJobInput {
  type: string;
  payload: Record<string, unknown>;
  userId?: string | null;
  maxAttempts?: number;
}

export const APP_QUEUE_NAME = 'app-jobs';

export const JOB_TYPES = {
  SEND_NOTIFICATION: 'SEND_NOTIFICATION',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

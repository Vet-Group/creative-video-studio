// The pg-boss queue shared by the web app (which enqueues) and the worker (which consumes and re-sends).
export const VIDEO_QUEUE = 'video';

/** pg-boss never retries a video job: a retry could bill the provider twice. */
export const VIDEO_QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: 900 } as const;

export interface VideoJobData {
  jobId: string;
}

/** One send per job (singletonKey) and one concurrency group per user. */
export const videoSendOptions = (userId: string, jobId: string) => ({ singletonKey: jobId, group: { id: userId } });

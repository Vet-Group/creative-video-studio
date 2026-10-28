// The pg-boss queue shared by the web app (which enqueues) and the worker (which consumes and re-sends).
export const VIDEO_QUEUE = 'video';

/** pg-boss never retries a video job: a retry could bill the provider twice. */
export const VIDEO_QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: 900 } as const;

/** The daily sweep that purges clips soft-deleted more than 30 days ago (cron in Asia/Ho_Chi_Minh time). */
export const PURGE_QUEUE = 'purge';
export const PURGE_CRON = '0 3 * * *';

/** Marketing Studio suggestions (suggest.ts): one LLM call per run, never retried; a run still waiting after a minute is given up. */
export const SUGGEST_QUEUE = 'suggest';
export const SUGGEST_QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: 60 } as const;
/** How long a page waits for a suggestion run before it is marked failed. */
export const SUGGEST_EXPIRY_SECONDS = 60;

export interface SuggestJobData {
  runId: string;
}

export interface VideoJobData {
  jobId: string;
}

/** One send per job (singletonKey) and one concurrency group per user. */
export const videoSendOptions = (userId: string, jobId: string) => ({ singletonKey: jobId, group: { id: userId } });

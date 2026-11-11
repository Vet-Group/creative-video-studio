// The pg-boss queue shared by the web app (which enqueues) and the worker (which consumes and re-sends).
export const VIDEO_QUEUE = 'video';

/** pg-boss never retries a video job: a retry could bill the provider twice. */
export const VIDEO_QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: 900 } as const;

/** The daily sweep that purges clips soft-deleted more than 30 days ago (cron in Asia/Ho_Chi_Minh time). */
export const PURGE_QUEUE = 'purge';
export const PURGE_CRON = '0 3 * * *';

/** Suggestions (suggest.ts): a few LLM calls per run, never retried. pg-boss's own expiry only marks the job; the handler still writes the run. */
export const SUGGEST_QUEUE = 'suggest';
export const SUGGEST_QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: 60 } as const;
/** How long a page waits for a suggestion run before it is marked failed: a short option takes a second call after the first (about 35 s at worst, 2026-11-04). */
export const SUGGEST_EXPIRY_SECONDS = 90;

/** Reference-video analysis (rea-video decompose): one decompose plus a few VLM calls per run, never retried. A long expiry covers the ffmpeg frame work and the per-shot VLM calls. */
export const ANALYZE_QUEUE = 'analyze';
export const ANALYZE_QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: 1800 } as const;

export interface AnalyzeJobData {
  analysisId: string;
}

export interface SuggestJobData {
  runId: string;
}

export interface VideoJobData {
  jobId: string;
}

/** One send per job (singletonKey) and one concurrency group per user. */
export const videoSendOptions = (userId: string, jobId: string) => ({ singletonKey: jobId, group: { id: userId } });

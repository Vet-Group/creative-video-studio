// Browser-side helpers: the JSON fetch wrapper and the shapes of the API responses the pages read.

import type { FailureReason } from './job-failure';
import { loginFor } from './return-to';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds from the X-Retry-After header of a limiter refusal, else null. */
    readonly retryAfter: number | null = null,
    /** The machine-readable code of a better-auth refusal, such as USER_NOT_VERIFIED, else null. */
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

// Set by a sign-out: a call still in flight then gets a 401, which must not send the user to /login?next=<this page> over the plain /login.
let signingOut = false;
export const startSignOut = () => {
  signingOut = true;
};

// A password change deletes every session before it sets the new cookie: a call sent on the old one meanwhile gets a 401 that is not a sign-out.
let rotating = 0;
let rotations = 0;
/** Runs a call that replaces the session cookie; a 401 for any call sent before it ends does not send the user to the login. */
export async function rotatingSession<T>(run: () => Promise<T>): Promise<T> {
  rotating++;
  try {
    return await run();
  } finally {
    rotating--;
    rotations++;
  }
}

/** Fetches a route and returns its JSON. A 401 outside the login page sends the user there, to come back to this page after the sign-in; any other failure throws an ApiError carrying the server's message. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const sentAt = rotations;
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  const stale = rotating > 0 || sentAt !== rotations;
  if (res.status === 401 && !signingOut && !stale && window.location.pathname !== '/login') window.location.assign(loginFor(window.location.pathname + window.location.search));
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`, Number(res.headers.get('x-retry-after')) || null, body?.code ?? null);
  return body as T;
}

/** A readable message for a failed call; the server's text is shown only for the cap refusals, which are written for Members. */
export const errorText = (e: unknown, fallback: string): string => (e instanceof ApiError && e.status === 429 ? e.message : fallback);

export const sendJson = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export type JobStatus = 'queued' | 'submitting' | 'running' | 'succeeded' | 'failed' | 'failed_unknown' | 'timed_out';

export interface TrayJob {
  id: string;
  status: JobStatus;
  error: string | null;
  /** Set when the provider refused the job's input image: a retry with the same inputs cannot succeed. */
  failureReason: FailureReason | null;
  /** The twin model a job refused for a real person can be re-run on (a button; migration 0075) with the price of that run, else null. */
  twin: { label: string; estimateUsd: string | null } | null;
  isMock: boolean;
  feature: string;
  ratio: string;
  durationSec: number;
  /** The resolution of an image job (its duration is 0), else null. */
  resolution: string | null;
  modelId: string;
  retryOf: string | null;
  retried: boolean;
  outputAssetId: string | null;
  posterAssetId: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** The member's own words, when kept. */
  text: string | null;
  inputAssetIds: string[];
  /** How many of a Try On job's inputs are garments (after the person, before the background). */
  garments: number | null;
  format: string | null;
  /** Unboxing's photo roles in the order of `inputAssetIds`. */
  roles: string | null;
  favorite: boolean;
  /** The job's estimate in USD (4 decimals), which a retry costs again; null for a job without one. */
  estimateUsd: string | null;
}

export interface Clip {
  id: string;
  creator: { id: string; name: string };
  createdAt: string;
  modelId: string;
  modelLabel: string;
  ratio: string;
  durationSec: number;
  feature: string;
  mediaType: 'video' | 'image';
  resolution: string | null;
  isMock: boolean;
  /** The output asset: the video, or the image when `mediaType` is 'image'. */
  videoAssetId: string;
  posterAssetId: string | null;
  storeId: string | null;
  costUsd: string;
  costFinal: boolean;
  /** `featured`: a Pass shown first on Explore. */
  verdict: { verdict: 'pass' | 'fail'; fault: string | null; featured: boolean; markedBy: string } | null;
  /** In the caller's own favourites. */
  favorite: boolean;
  /** On its page's Examples tab, put there by an Admin. */
  example: boolean;
  /** The creator's own words (a free prompt on Create video or Image Generation), else null. */
  prompt: string | null;
  canEdit: boolean;
  downloadName: string;
}

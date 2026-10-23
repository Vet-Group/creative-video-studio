// Browser-side helpers: the JSON fetch wrapper and the shapes of the API responses the pages read.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fetches a route and returns its JSON. A 401 outside the login page sends the user there; any other failure throws an ApiError carrying the server's message. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (res.status === 401 && window.location.pathname !== '/login') window.location.assign('/login');
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`);
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
  isMock: boolean;
  ratio: string;
  durationSec: number;
  modelId: string;
  retryOf: string | null;
  retried: boolean;
  outputAssetId: string | null;
  posterAssetId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Clip {
  id: string;
  creator: { id: string; name: string };
  createdAt: string;
  modelId: string;
  modelLabel: string;
  ratio: string;
  durationSec: number;
  isMock: boolean;
  videoAssetId: string;
  posterAssetId: string | null;
  storeId: string | null;
  costUsd: string;
  costFinal: boolean;
  verdict: { verdict: 'pass' | 'fail'; fault: string | null; markedBy: string } | null;
  canEdit: boolean;
  downloadName: string;
}

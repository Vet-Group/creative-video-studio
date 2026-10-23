import { estimateUsd } from '../models';
import type { ProviderJob, SubmitRequest } from './types';

/** A provider answered with a non-2xx status; B.4's funding gate reads `status` (402 means no credit). */
export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type Fetch = typeof fetch;

export async function sendJson(f: Fetch, what: string, url: string, init: RequestInit): Promise<unknown> {
  const res = await f(url, init);
  const text = await res.text();
  if (!res.ok) throw new ProviderHttpError(res.status, `${what}: HTTP ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

// The provider job id carries the requested duration ("5:abc123"), so status() can estimate the cost after a worker restart.
export const packJobId = (durationSec: number, id: string): string => `${durationSec}:${id}`;

export function unpackJobId(job: ProviderJob): { durationSec: number; id: string } {
  const at = job.providerJobId.indexOf(':');
  return { durationSec: Number(job.providerJobId.slice(0, at)), id: job.providerJobId.slice(at + 1) };
}

/** Neither API returns a billed amount (billedAmountField is null), so a final state costs usdPerSecond x requested duration. */
export const estimate = (req: Pick<SubmitRequest, 'model'>, durationSec: number) => ({
  costUsd: Number(estimateUsd(req.model.usdPerSecond, durationSec)),
  costSource: 'estimate' as const,
});

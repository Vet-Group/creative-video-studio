import { estimateUsd } from '../models';
import type { ProviderJob, SubmitRequest } from './types';

/** A provider answered with a non-2xx status; `body` keeps the response text for isFundingRefusal. */
export class ProviderHttpError extends Error {
  readonly status: number;
  readonly body: string;
  // Fields are declared out here, not as constructor parameter properties, so the scripts can run this file under Node's type stripping.
  constructor(status: number, body: string, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * True when the provider refused for lack of credit or billing, which is not a render failure (plan, Credit thrift).
 * 402 is the expected code; fal is reported to answer 403 "User is locked. Reason: Exhausted balance", so any 4xx whose body names a balance
 * problem counts too. B.5a confirms the real codes against the live APIs.
 */
export const isFundingRefusal = (e: unknown): boolean =>
  e instanceof ProviderHttpError && (e.status === 402 || (e.status >= 400 && e.status < 500 && /balance|billing|credit|locked|payment/i.test(e.body)));

export type Fetch = typeof fetch;

/** Reads the bytes behind a non-https image URL (the worker's `asset://<id>`). */
export type ReadImage = (url: string) => Promise<{ bytes: Uint8Array; contentType: string }>;

/** Every request after submit gets a bounded wait, so a stuck provider cannot hang a poll. */
export const timeout = (): AbortSignal => AbortSignal.timeout(30_000);

export async function sendJson(f: Fetch, what: string, url: string, init: RequestInit): Promise<unknown> {
  const res = await f(url, init);
  const text = await res.text();
  if (!res.ok) throw new ProviderHttpError(res.status, text, `${what}: HTTP ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * https: URLs pass through. Any other scheme is read with `readImage` and inlined as a data URL, before any network call to the provider, so a
 * failed read submits nothing. shortcut: both providers document data URLs for inputs, but neither readable doc page shows a plain-HTTP upload
 * endpoint (fal CDN, Replicate Files API); swap to an upload when B.5a finds data URLs too large for a model.
 */
export async function resolveImages(urls: string[], readImage?: ReadImage): Promise<string[]> {
  return Promise.all(
    urls.map(async (url) => {
      if (url.startsWith('https:')) return url;
      if (!readImage) throw new ImageReadError(`image ${url.split(':')[0]}: URL needs a readImage resolver`);
      try {
        const { bytes, contentType } = await readImage(url);
        return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
      } catch (e) {
        throw new ImageReadError(`image ${url.split(':')[0]}: ${(e as Error).message}`);
      }
    }),
  );
}

/** An input image could not be read locally; thrown before any network call, so nothing was submitted or billed. */
export class ImageReadError extends Error {}

// The provider job id carries the requested duration ("5:abc123"), so status() can estimate the cost after a worker restart.
export const packJobId = (durationSec: number, id: string): string => `${durationSec}:${id}`;

export function unpackJobId(job: ProviderJob): { durationSec: number; id: string } {
  const m = /^([1-9]\d*):(.+)$/.exec(job.providerJobId);
  if (!m) throw new Error(`provider job id "${job.providerJobId}" has no positive duration prefix`);
  return { durationSec: Number(m[1]), id: m[2]! };
}

/** Neither API returns a billed amount (billedAmountField is null), so a final state costs usdPerSecond x requested duration. */
export const estimate = (req: Pick<SubmitRequest, 'model'>, durationSec: number) => ({
  costUsd: Number(estimateUsd(req.model.usdPerSecond, durationSec)),
  costSource: 'estimate' as const,
});

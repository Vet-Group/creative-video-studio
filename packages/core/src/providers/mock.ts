import { estimate, imageEstimate, packJobId, unpackJobId } from './http';
import type { ImageProvider, ProviderStatus, VideoProvider } from './types';

/** A prompt containing this ends the mock job as failed. */
export const MOCK_FAIL = 'MOCK_FAIL';

/**
 * No network and no clock: a job answers queued, then running, then its final state, counted per job by status() calls.
 * State is in memory, so a mock job does not survive a restart; use apps/worker's mock provider when that matters.
 */
export function createMockVideoProvider(opts: { runningPolls?: number } = {}): VideoProvider {
  const runningPolls = opts.runningPolls ?? 1;
  const polls = new Map<string, number>();
  const outcome = new Map<string, 'ok' | 'fail' | 'canceled'>();
  let n = 0;
  return {
    async submit(req) {
      const id = `mock-${++n}`;
      outcome.set(id, req.prompt.includes(MOCK_FAIL) ? 'fail' : 'ok');
      return { providerJobId: packJobId(req.durationSec, id) };
    },
    async status(job): Promise<ProviderStatus> {
      const { durationSec, id } = unpackJobId(job);
      const state = outcome.get(id);
      if (!state) throw new Error(`mock provider: unknown job ${id}`);
      const cost = estimate(job, durationSec);
      if (state === 'canceled') return { state: 'canceled', error: 'canceled', ...cost };
      const seen = polls.get(id) ?? 0;
      polls.set(id, seen + 1);
      if (seen === 0) return { state: 'queued' };
      if (seen <= runningPolls) return { state: 'running' };
      if (state === 'fail') return { state: 'failed', error: 'mock provider failure', ...cost };
      return { state: 'succeeded', outputUrl: `mock://video/${id}.mp4`, ...cost };
    },
    async cancel(job) {
      outcome.set(unpackJobId(job).id, 'canceled');
      return { supported: true };
    },
  };
}

/** The same shape for images: queued, then running, then its final state; the output is `mock://image/<id>.png` and the cost the model's price. */
export function createMockImageProvider(opts: { runningPolls?: number } = {}): ImageProvider {
  const runningPolls = opts.runningPolls ?? 1;
  const polls = new Map<string, number>();
  const outcome = new Map<string, 'ok' | 'fail' | 'canceled'>();
  let n = 0;
  return {
    async submit(req) {
      const id = `mock-image-${++n}`;
      outcome.set(id, req.prompt.includes(MOCK_FAIL) ? 'fail' : 'ok');
      return { providerJobId: id };
    },
    async status(job): Promise<ProviderStatus> {
      const id = job.providerJobId;
      const state = outcome.get(id);
      if (!state) throw new Error(`mock provider: unknown job ${id}`);
      const cost = imageEstimate(job);
      if (state === 'canceled') return { state: 'canceled', error: 'canceled', ...cost };
      const seen = polls.get(id) ?? 0;
      polls.set(id, seen + 1);
      if (seen === 0) return { state: 'queued' };
      if (seen <= runningPolls) return { state: 'running' };
      if (state === 'fail') return { state: 'failed', error: 'mock provider failure', ...cost };
      return { state: 'succeeded', outputUrl: `mock://image/${id}.png`, ...cost };
    },
    async cancel(job) {
      outcome.set(job.providerJobId, 'canceled');
      return { supported: true };
    },
  };
}

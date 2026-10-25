// A video provider that bills nothing: submit cuts a one-second sample MP4 with ffmpeg and the job "finishes" runMs later (an image provider follows below).
// The job id carries everything status() needs, so a job survives a worker restart. The model config is marked mock.
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { ImageProvider, VideoProvider } from '@cvs/core/providers';
import { requireFfmpeg } from './media';

const run = promisify(execFile);
const SIZES = { '9:16': '720x1280', '1:1': '720x720' } as const;
/** A prompt containing this ends the mock job as failed, so tests can reach the failure path. */
export const MOCK_FAIL = 'MOCK_FAIL';

export function createMockProvider(opts: { runMs: number; dir?: string }): VideoProvider {
  const dir = opts.dir ?? join(tmpdir(), 'cvs-mock-provider');
  return {
    async submit(req) {
      const id = crypto.randomUUID();
      const outcome = req.prompt.includes(MOCK_FAIL) ? 'fail' : 'ok';
      await mkdir(dir, { recursive: true });
      await run(requireFfmpeg(), [
        '-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${SIZES[req.ratio === 'auto' ? '9:16' : req.ratio]}:rate=24`, '-t', '1',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(dir, `${id}.mp4`),
      ]);
      return { providerJobId: `mock:${Date.now() + opts.runMs}:${outcome}:${id}` };
    },
    async status(job) {
      const [, readyAt, outcome, id] = job.providerJobId.split(':');
      if (Date.now() < Number(readyAt)) return { state: 'running' };
      if (outcome === 'fail') return { state: 'failed', error: 'mock provider failure', costUsd: 0, costSource: 'estimate' };
      return { state: 'succeeded', outputUrl: pathToFileURL(join(dir, `${id}.mp4`)).href, costUsd: 0, costSource: 'estimate' };
    },
    async cancel() {
      return { supported: true };
    },
  };
}

/** The same for images: submit cuts a one-frame PNG in the job's ratio ('auto' is square), and the job "finishes" runMs later. A mock job books 0 in the ledger. */
export function createMockImageProvider(opts: { runMs: number; dir?: string }): ImageProvider {
  const dir = opts.dir ?? join(tmpdir(), 'cvs-mock-provider');
  return {
    async submit(req) {
      const id = crypto.randomUUID();
      const outcome = req.prompt.includes(MOCK_FAIL) ? 'fail' : 'ok';
      await mkdir(dir, { recursive: true });
      const [w, h] = req.ratio === 'auto' ? [1, 1] : req.ratio.split(':').map(Number);
      await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${w! * 64}x${h! * 64}`, '-frames:v', '1', join(dir, `${id}.png`)]);
      return { providerJobId: `mock:${Date.now() + opts.runMs}:${outcome}:${id}` };
    },
    async status(job) {
      const [, readyAt, outcome, id] = job.providerJobId.split(':');
      if (Date.now() < Number(readyAt)) return { state: 'running' };
      if (outcome === 'fail') return { state: 'failed', error: 'mock provider failure', costUsd: 0, costSource: 'estimate' };
      return { state: 'succeeded', outputUrl: pathToFileURL(join(dir, `${id}.png`)).href, costUsd: 0, costSource: 'estimate' };
    },
    async cancel() {
      return { supported: true };
    },
  };
}

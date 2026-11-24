// Reframe & download on a video: fits the asset into a 9:16, 4:5 or 1:1 frame and keeps the copy at reframedKey(...); the web streams it from there.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPRESS_MAX_BYTES, type ReframeJobData, reframedKey } from '@cvs/core/queue';
import type { LedgerPool } from '@cvs/core/ledger';
import { reframeClip, stillSlot } from './media';
import { downloadObject, hasObject, putObject } from './storage';

/**
 * Reframes one video asset once per shape and fill; a stored copy is kept and reused. Throws, as a compression does, when the asset is not an output video
 * within the size cap, ffmpeg fails or times out, or `signal` aborts (pg-boss expired the job), which also kills ffmpeg and frees its slot.
 */
export async function reframeVideoAsset(pool: LedgerPool, { assetId, ratio, fill }: ReframeJobData, signal?: AbortSignal, timeoutMs?: number): Promise<void> {
  const key = reframedKey(assetId, ratio, fill);
  if (await hasObject(key)) return;
  const asset = (await pool.query(`select s3_key, mime, kind, bytes from assets where id = $1 and deleted_at is null`, [assetId])).rows[0] as { s3_key: string; mime: string; kind: string; bytes: number } | undefined;
  if (!asset?.mime.startsWith('video/') || asset.kind !== 'output' || asset.bytes > COMPRESS_MAX_BYTES) throw new Error(`asset ${assetId} is not an output video within the size cap`);
  const dir = await mkdtemp(join(tmpdir(), 'cvs-reframe-'));
  try {
    const src = join(dir, 'in');
    const out = join(dir, 'out.mp4');
    await downloadObject(asset.s3_key, src, signal);
    await stillSlot(() => reframeClip(src, out, ratio, fill, { signal, timeoutMs })); // shares the worker's four ffmpeg slots
    await putObject(key, await readFile(out), 'video/mp4');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

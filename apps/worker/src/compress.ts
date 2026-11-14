// Compress & download on a video: re-encodes the asset smaller and keeps the copy at compressedKey(assetId); the web streams it from there.
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPRESS_MAX_BYTES, compressedKey } from '@cvs/core/queue';
import type { LedgerPool } from '@cvs/core/ledger';
import { compressClip, stillSlot } from './media';
import { downloadObject, hasObject, putObject } from './storage';

/** A copy must be at least this much smaller than the original, else the original is the better file to hand out and nothing is stored. */
export const MIN_SAVING = 0.2;

/**
 * Compresses one video asset once: 'stored' (now or already), or 'original' when the copy is not enough smaller. Throws when the asset is not an output video
 * within the size cap, ffmpeg fails or times out, or `signal` aborts (pg-boss expired the job), which also kills ffmpeg and frees its slot.
 */
export async function compressVideoAsset(pool: LedgerPool, assetId: string, signal?: AbortSignal, timeoutMs?: number): Promise<'stored' | 'original'> {
  if (await hasObject(compressedKey(assetId))) return 'stored';
  const asset = (await pool.query(`select s3_key, mime, kind, bytes from assets where id = $1 and deleted_at is null`, [assetId])).rows[0] as { s3_key: string; mime: string; kind: string; bytes: number } | undefined;
  if (!asset?.mime.startsWith('video/') || asset.kind !== 'output' || asset.bytes > COMPRESS_MAX_BYTES) throw new Error(`asset ${assetId} is not an output video within the size cap`);
  const dir = await mkdtemp(join(tmpdir(), 'cvs-compress-'));
  try {
    const src = join(dir, 'in');
    const out = join(dir, 'out.mp4');
    await downloadObject(asset.s3_key, src, signal);
    await stillSlot(() => compressClip(src, out, { signal, timeoutMs })); // shares the worker's four ffmpeg slots
    if ((await stat(out)).size > (await stat(src)).size * (1 - MIN_SAVING)) return 'original';
    await putObject(compressedKey(assetId), await readFile(out), 'video/mp4');
    return 'stored';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

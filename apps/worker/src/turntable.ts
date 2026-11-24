// The 360 turntable of a multi-angle Run: the photo and its 7 horizontal views stitched into a looping MP4 kept at turntableKey(...); the web streams it from there.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LedgerPool } from '@cvs/core/ledger';
import { type TurntableJobData, turntableKey } from '@cvs/core/queue';
import { TURNTABLE_VIEWS, turntableState } from '@cvs/core/turntable';
import sharp from 'sharp';
import { stillSlot, turntableClip } from './media';
import { getObject, hasObject, putObject } from './storage';

/** The longest side of the video, as a reframed clip's: a 6000 px photo would make 192 frames of 36 megapixels. */
const MAX_SIDE = 1920;
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** The latest live succeeded job of each horizontal view of the Run on this photo (a retry keeps the Run's id, so a view may have several), with its output. */
async function viewOutputs(pool: LedgerPool, { batch, inputAssetId, userId, workspaceId }: TurntableJobData): Promise<{ view: string; assetId: string }[]> {
  const { rows } = await pool.query(
    `select distinct on (params->>'view') params->>'view' as view, output_asset_id as asset_id
       from jobs
      where feature = 'multi_angle' and user_id = $1 and workspace_id = $2 and params->>'batch' = $3 and input_asset_ids[1] = $4
        and status = 'succeeded' and deleted_at is null and purged_at is null and output_asset_id is not null and params->>'view' = any($5::text[])
      order by params->>'view', created_at desc`,
    [userId, workspaceId, batch, inputAssetId, TURNTABLE_VIEWS],
  );
  return rows.map((r) => ({ view: r.view as string, assetId: r.asset_id as string }));
}

/**
 * What to make once a job has just succeeded: the Run and photo of a multi-angle job on a horizontal view whose Run now has all 7 views, else undefined (another
 * feature, no Run, the top view, or a view still missing). One lookup of the job, one of its Run's views.
 */
export async function turntableDue(pool: LedgerPool, jobId: string): Promise<TurntableJobData | undefined> {
  const job = (await pool.query(`select user_id, workspace_id, feature, params->>'batch' as batch, params->>'view' as view, input_asset_ids[1] as input from jobs where id = $1`, [jobId])).rows[0];
  if (!job || job.feature !== 'multi_angle' || !job.batch || !job.input || !TURNTABLE_VIEWS.includes(job.view)) return undefined;
  const data: TurntableJobData = { batch: job.batch, inputAssetId: job.input, userId: job.user_id, workspaceId: job.workspace_id };
  const done = await viewOutputs(pool, data);
  return turntableState(done.map((d) => ({ view: d.view, status: 'succeeded' }))).ready ? data : undefined;
}

/**
 * Stitches one Run's turntable once; a stored one is kept and reused. The frames are the photo, then the views from 45 to 315 degrees, each fitted into the photo's
 * size (white padding, even sides). Throws when the Run no longer has all 7 views (one was deleted meanwhile), a file is gone, ffmpeg fails or times out, or `signal`
 * aborts (pg-boss expired the job), which also kills ffmpeg and frees its slot.
 */
export async function stitchTurntable(pool: LedgerPool, data: TurntableJobData, signal?: AbortSignal, timeoutMs?: number): Promise<void> {
  const key = turntableKey(data.batch, data.inputAssetId);
  if (await hasObject(key)) return;
  const outputs = await viewOutputs(pool, data);
  if (!turntableState(outputs.map((o) => ({ view: o.view, status: 'succeeded' }))).ready) throw new Error(`the Run ${data.batch} no longer has all 7 views`);
  const ids = [data.inputAssetId, ...TURNTABLE_VIEWS.map((v) => outputs.find((o) => o.view === v)!.assetId)];
  const keys = new Map((await pool.query(`select id, s3_key from assets where id = any($1::text[]) and deleted_at is null`, [ids])).rows.map((r) => [r.id as string, r.s3_key as string]));
  const dir = await mkdtemp(join(tmpdir(), 'cvs-turntable-'));
  try {
    let size: { width: number; height: number } | undefined;
    for (const [n, id] of ids.entries()) {
      signal?.throwIfAborted();
      const s3Key = keys.get(id);
      if (!s3Key) throw new Error(`asset ${id} of the Run ${data.batch} is gone`);
      const bytes = await getObject(s3Key);
      if (!size) {
        // The photo (first) sets the size, as it looks upright (EXIF orientations 5 to 8 turn it a quarter).
        const meta = await sharp(bytes).metadata();
        const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height!, meta.width!] : [meta.width!, meta.height!];
        const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        size = { width: even(w * scale), height: even(h * scale) };
      }
      await sharp(bytes).rotate().resize(size.width, size.height, { fit: 'contain', background: '#fff' }).flatten({ background: '#fff' }).png().toFile(join(dir, `${String(n).padStart(2, '0')}.png`));
    }
    const out = join(dir, 'out.mp4');
    await stillSlot(() => turntableClip(dir, out, { signal, timeoutMs })); // shares the worker's four ffmpeg slots
    await putObject(key, await readFile(out), 'video/mp4');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

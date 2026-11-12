// Smart Remake (Feature B): puts a member's product image into chosen shots of one of their analysed reference videos
// (@cvs/core/analysis/remake). Per shot, the frame at the shot's start is edited with the product (Nano Banana edit), then
// animated (Seedance); each paid call is booked to the ledger as it returns, and the clips are joined into one silent MP4.
// Gated by REA_REMAKE_ENABLED at the worker subscription and inert when off. The two fal calls and the object store are
// injected, so the path is unit-tested with no network, S3 or paid call; ffmpeg runs for real on tiny clips.
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Analysis, AnalysisShot } from '@cvs/core/analysis/breakdown';
import { REMAKE_EDIT_ENDPOINT, REMAKE_EDIT_USD, REMAKE_MAX_SHOTS, REMAKE_SHOT_SECONDS, REMAKE_VIDEO_ENDPOINT, REMAKE_VIDEO_USD_PER_SECOND } from '@cvs/core/analysis/remake';
import { bookLlm } from '@cvs/core/ledger';
import type { ImageModelConfig, ModelConfig } from '@cvs/core/models';
import type { ProviderStatus } from '@cvs/core/providers';
import { createFalImageProvider, createFalProvider } from '@cvs/core/providers/fal';
import { concatClips, extractFrameAt, probeSize, sniffImage } from './media';
import { fitForInline } from './real-providers';
import { getObject, putObject } from './storage';
import type { WorkerDeps } from './worker';

type Pool = WorkerDeps['pool'];
type Image = { bytes: Uint8Array; contentType: string };
type Write = (key: string, body: Uint8Array, contentType: string) => Promise<void>;

/** A paid call that failed after fal took the request: its cost is booked like a success's. */
export class PaidCallError extends Error {
  constructor(
    message: string,
    readonly costUsd: number,
  ) {
    super(message);
  }
}

export interface RemakeSeams {
  read?: (key: string) => Promise<Uint8Array>;
  write?: Write;
  /** The shot's frame (first image) with the product (second image) put into it, and the call's cost. Throws PaidCallError when fal billed a failure. */
  edit?: (frame: Image, product: Image, prompt: string) => Promise<{ image: Image; costUsd: number }>;
  /** An MP4 of `seconds` animated from the image, and the call's cost. Throws PaidCallError when fal billed a failure. */
  animate?: (image: Image, prompt: string, seconds: number) => Promise<{ video: Uint8Array; costUsd: number }>;
}

/** The feature switch for this worker. Default OFF: the queue is not subscribed and no remake is swept when unset. */
export const reaRemakeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.REA_REMAKE_ENABLED === '1';

const EDIT_PROMPT =
  'Replace the product in the first image with the product shown in the second image. Keep everything else in the first image exactly the same: the person, face, pose, hair, hands, background, lighting and camera framing. Reproduce the product faithfully, with its shape, colours, print and text.';
/** The shot's own English prompt from the analysis, told to keep the product the edit put in. */
const animatePrompt = (shot: AnalysisShot): string => `${shot.prompt} Keep the product exactly as it appears in the image.`;
/** A frame (at 24 fps) past the shot's cut, so the previous shot's last frame is never the one taken. */
const FRAME_OFFSET_S = 0.04;

// The two models, priced as @cvs/core/analysis/remake estimates. Neither is a model_configs row, so neither shows in Create.
const EDIT_MODEL: ImageModelConfig = { id: 'smart-remake-edit', provider: 'fal', endpoint: REMAKE_EDIT_ENDPOINT, label: 'Nano Banana', ratios: ['auto'], maxImages: 2, imagePrices: { '1K': String(REMAKE_EDIT_USD) }, features: [] };
const VIDEO_MODEL: ModelConfig = {
  id: 'smart-remake-video', provider: 'fal', endpoint: REMAKE_VIDEO_ENDPOINT, label: 'Seedance 1.0 Pro Fast', ratios: [], durationsSec: [REMAKE_SHOT_SECONDS],
  maxImages: 1, outputResolution: '720p', usdPerSecond: REMAKE_VIDEO_USD_PER_SECOND, billedAmountField: null, sources: {},
};

const falKey = (): string => {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY is not set');
  return key;
};

/** The inputs go as `mem:<n>` and are inlined from memory, shrunk as a job's inputs are. */
const memReader = (images: Image[]) => async (url: string) => {
  const img = images[Number(url.slice('mem:'.length))];
  if (!img) throw new Error(`no input ${url}`);
  return fitForInline(img.bytes, img.contentType);
};

const POLL_MS = 3_000;
/** fal's queue answers within a few minutes; past this the call is given up and booked at its estimate, as fal may still run it. */
const CALL_DEADLINE_MS = 10 * 60_000;

/** Polls one submitted fal request to its end and downloads the output. Every failure from here on carries the call's cost: fal took the request. */
async function settleFal(status: () => Promise<ProviderStatus>, estimateUsd: number): Promise<{ bytes: Uint8Array; costUsd: number }> {
  const deadline = Date.now() + CALL_DEADLINE_MS;
  for (;;) {
    // A failed poll (network, 429) says nothing about the request, so it is polled again.
    const s = await status().catch(() => undefined);
    if (s?.state === 'succeeded') {
      try {
        const res = await fetch(s.outputUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { bytes: new Uint8Array(await res.arrayBuffer()), costUsd: s.costUsd };
      } catch (e) {
        throw new PaidCallError(`could not download the fal output: ${message(e)}`, s.costUsd);
      }
    }
    if (s?.state === 'failed' || s?.state === 'canceled') throw new PaidCallError(s.error, s.costUsd);
    if (Date.now() > deadline) throw new PaidCallError(`fal did not finish within ${CALL_DEADLINE_MS / 60_000} minutes`, estimateUsd);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

const defaultEdit: NonNullable<RemakeSeams['edit']> = async (frame, product, prompt) => {
  const fal = createFalImageProvider({ apiKey: falKey(), readImage: memReader([frame, product]) });
  const { providerJobId } = await fal.submit({ model: EDIT_MODEL, prompt, imageUrls: ['mem:0', 'mem:1'], ratio: 'auto', resolution: '1K' });
  const out = await settleFal(() => fal.status({ providerJobId, model: EDIT_MODEL, resolution: '1K' }), REMAKE_EDIT_USD);
  const type = sniffImage(out.bytes);
  if (!type) throw new PaidCallError('the edited frame is not a PNG, JPEG or WebP image', out.costUsd);
  return { image: { bytes: out.bytes, contentType: type.mime }, costUsd: out.costUsd };
};

const defaultAnimate: NonNullable<RemakeSeams['animate']> = async (image, prompt, seconds) => {
  const fal = createFalProvider({ apiKey: falKey(), readImage: memReader([image]) });
  const { providerJobId } = await fal.submit({ model: VIDEO_MODEL, prompt, imageUrls: ['mem:0'], ratio: 'auto', durationSec: seconds });
  const out = await settleFal(() => fal.status({ providerJobId, model: VIDEO_MODEL }), REMAKE_VIDEO_USD_PER_SECOND * seconds);
  return { video: out.bytes, costUsd: out.costUsd };
};

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 2000);
const usd = (n: number): string => String(Number(n.toFixed(6)));

interface ShotResult {
  index: number;
  status: 'succeeded' | 'failed';
  clipAssetId?: string;
  costUsd: number;
  error?: string;
}

/** Stores an MP4 as the member's output asset, as a job's clip is stored. */
async function storeVideo(pool: Pool, write: Write, ownerId: string, file: string, filename: string): Promise<string> {
  const bytes = await readFile(file);
  const { width, height } = await probeSize(file);
  const id = randomUUID();
  await write(`assets/${id}`, bytes, 'video/mp4');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, width, height) values ($1, $2, 'output', $3, $4, 'video/mp4', $5, $6, $7)`, [
    id, ownerId, `assets/${id}`, filename, bytes.length, width, height,
  ]);
  return id;
}

/**
 * Claims a queued remake, makes one clip per chosen shot, joins them and stores the outcome: 'succeeded' when every shot made a clip and they joined,
 * 'partial' when only some did (their clips stay viewable), 'failed' when none did. Safe to call more than once for the same id: only a `queued` row is claimed.
 */
export async function runRemake(pool: Pool, remakeId: string, seams: RemakeSeams = {}): Promise<void> {
  const read = seams.read ?? getObject;
  const write = seams.write ?? putObject;
  const edit = seams.edit ?? defaultEdit;
  const animate = seams.animate ?? defaultAnimate;

  const claimed = (await pool.query(`update remakes set status = 'running', started_at = now() where id = $1 and status = 'queued'`, [remakeId])).rowCount;
  if (!claimed) return; // another worker claimed it, or it already ran

  const shots: ShotResult[] = [];
  const spent = () => usd(shots.reduce((sum, s) => sum + s.costUsd, 0));
  const finish = (status: 'succeeded' | 'partial' | 'failed', outputAssetId: string | null, error: string | null) =>
    pool.query(
      `update remakes set status = $2, result = $3, output_asset_id = $4, cost_usd = $5, error = $6, finished_at = now() where id = $1 and status = 'running'`,
      [remakeId, status, JSON.stringify({ shots }), outputAssetId, spent(), error],
    );
  // Books one paid call as soon as it returns or fails, so a stopped worker leaves at most the call in flight unbooked.
  const paid = async <T extends { costUsd: number }>(entry: ShotResult, step: 'edit' | 'video', model: string, call: () => Promise<T>): Promise<T> => {
    const book = async (costUsd: number) => {
      await bookLlm(pool, { remake: remakeId, step: `${entry.index}:${step}` }, { costUsd, provider: 'fal', model });
      entry.costUsd += costUsd;
    };
    try {
      const out = await call();
      await book(out.costUsd);
      return out;
    } catch (e) {
      if (e instanceof PaidCallError) await book(e.costUsd);
      throw e;
    }
  };

  const dir = await mkdtemp(join(tmpdir(), 'cvs-remake-'));
  try {
    const r = (
      await pool.query(
        `select r.user_id, r.shots, a.source_key, a.result, p.s3_key as product_key, p.mime as product_mime
           from remakes r join analyses a on a.id = r.analysis_id left join assets p on p.id = r.product_asset_id and p.deleted_at is null
          where r.id = $1`,
        [remakeId],
      )
    ).rows[0];
    const chosen = r.shots as number[];
    // The API checks this too; it is checked again before the first paid call, as the cap is what bounds a remake's spend.
    if (chosen.length > REMAKE_MAX_SHOTS) throw new Error(`at most ${REMAKE_MAX_SHOTS} shots per remake`);
    if (!r.product_key) throw new Error('the product image is no longer available');
    const video = join(dir, 'source.mp4');
    await writeFile(video, await read(r.source_key));
    const product = { bytes: await read(r.product_key), contentType: r.product_mime as string };
    const analysisShots = (r.result as Analysis | null)?.shots ?? [];
    const clips: string[] = [];

    for (const index of chosen) {
      const entry: ShotResult = { index, status: 'failed', costUsd: 0 };
      try {
        const shot = analysisShots.find((s) => s.index === index);
        if (!shot) throw new Error(`shot ${index} is not in the analysis`);
        const frameFile = join(dir, `frame-${index}.jpg`);
        await extractFrameAt(video, Math.min(shot.start + FRAME_OFFSET_S, shot.end), frameFile);
        const frame = { bytes: new Uint8Array(await readFile(frameFile)), contentType: 'image/jpeg' };
        const edited = await paid(entry, 'edit', REMAKE_EDIT_ENDPOINT, () => edit(frame, product, EDIT_PROMPT));
        const clip = await paid(entry, 'video', REMAKE_VIDEO_ENDPOINT, () => animate(edited.image, animatePrompt(shot), REMAKE_SHOT_SECONDS));
        const clipFile = join(dir, `clip-${index}.mp4`);
        await writeFile(clipFile, clip.video);
        entry.clipAssetId = await storeVideo(pool, write, r.user_id, clipFile, `remake-${remakeId.slice(0, 8)}-shot-${index}.mp4`);
        entry.status = 'succeeded';
        clips.push(clipFile);
      } catch (e) {
        // One shot's failure never stops the others; what it spent is already booked.
        entry.error = message(e);
      }
      shots.push(entry);
      await pool.query('update remakes set result = $2, cost_usd = $3 where id = $1', [remakeId, JSON.stringify({ shots }), spent()]);
    }

    let outputAssetId: string | null = null;
    let error = shots.find((s) => s.error)?.error ?? null;
    if (clips.length > 0) {
      try {
        const joined = join(dir, 'remake.mp4');
        await concatClips(clips, joined);
        outputAssetId = await storeVideo(pool, write, r.user_id, joined, `remake-${remakeId.slice(0, 8)}.mp4`);
      } catch (e) {
        error = `the clips could not be joined: ${message(e)}`;
      }
    }
    const made = clips.length;
    await finish(made === 0 ? 'failed' : made === chosen.length && outputAssetId ? 'succeeded' : 'partial', outputAssetId, error);
  } catch (e) {
    await finish(shots.some((s) => s.status === 'succeeded') ? 'partial' : 'failed', null, message(e));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Longer than any remake can run: every shot's two calls at their deadline, plus the frame, join and upload work. */
const STALE_AFTER_MS = REMAKE_MAX_SHOTS * 2 * CALL_DEADLINE_MS + 10 * 60_000;

/**
 * Closes the remakes a stopped worker left open (no queue retries them): 'partial' when some shots made clips, which stay booked and viewable, else 'failed'.
 * A queued remake whose queue message was lost is closed the same way. Returns how many it closed.
 */
export async function closeStaleRemakes(pool: Pool, staleAfterMs = STALE_AFTER_MS): Promise<number> {
  const { rowCount } = await pool.query(
    `update remakes
        set status = case when exists (select 1 from jsonb_array_elements(coalesce(result->'shots', '[]'::jsonb)) s where s->>'status' = 'succeeded') then 'partial' else 'failed' end,
            error = coalesce(error, 'the worker stopped before the remake finished'), finished_at = now()
      where status in ('queued', 'running') and coalesce(started_at, created_at) < now() - ($1::float8 * interval '1 millisecond')`,
    [staleAfterMs],
  );
  return rowCount ?? 0;
}

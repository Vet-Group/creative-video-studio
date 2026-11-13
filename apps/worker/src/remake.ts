// Smart Remake (Feature B): puts a member's product image into chosen shots of one of their analysed reference videos
// (@cvs/core/analysis/remake). Per shot, the shot's own clip is edited with the product (Wan 2.7 video edit), keeping its motion,
// framing and length; each paid call is booked to the ledger as it returns, and the clips are joined into one silent MP4, with a
// before/after video beside it. Gated by REA_REMAKE_ENABLED at the worker subscription and inert when off. The fal call and the
// object store are injected, so the path is unit-tested with no network, S3 or paid call; ffmpeg runs for real on tiny clips.
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Analysis, AnalysisShot } from '@cvs/core/analysis/breakdown';
import { REMAKE_ENDPOINT, REMAKE_MAX_SECONDS, REMAKE_MAX_SHOTS, REMAKE_USD_PER_SECOND, remakeScene, remakeShotSeconds } from '@cvs/core/analysis/remake';
import { bookLlm } from '@cvs/core/ledger';
import type { ModelConfig } from '@cvs/core/models';
import type { ProviderStatus } from '@cvs/core/providers';
import { createFalProvider } from '@cvs/core/providers/fal';
import { REMAKE_QUEUE_OPTIONS } from '@cvs/core/queue';
import { insertAssets } from '@cvs/db/assets';
import { createDb } from '@cvs/db/client';
import { falActive } from './fal-next';
import { concatClips, cutShot, probeSize, probeVideoSeconds, sideBySide, trimClip } from './media';
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

/** The fal account a request was sent to; its key must also poll it (fal-next.ts). */
type FalAccount = 'personal' | 'team';

/** What `result` holds besides the finished shots while a remake runs: the worker that owns it and, per shot index, the fal request it submitted. */
export interface RemakeState {
  worker?: string;
  fal?: Record<string, { providerJobId: string; account: FalAccount }>;
  shots?: ShotResult[];
}

/** The edit's hand-over to the remake: `saved` records fal's request id as soon as the submit returns, `resume` is a request a stopped worker submitted, polled instead of submitting again. */
export interface FalCall {
  resume?: { providerJobId: string; account: FalAccount };
  saved: (providerJobId: string, account: FalAccount) => Promise<void>;
}

export interface RemakeSeams {
  /** This worker's id, which owns the remakes it claims (worker_heartbeat); another worker takes them over when its heartbeat stops. */
  workerId?: string;
  read?: (key: string) => Promise<Uint8Array>;
  write?: Write;
  /** The shot's clip (an MP4 a little over `seconds`) with the product put into it, `seconds` long, and the call's cost. Throws PaidCallError when fal billed a failure. */
  edit?: (clip: Uint8Array, product: Image, prompt: string, seconds: number, call: FalCall) => Promise<{ video: Uint8Array; costUsd: number }>;
}

/** The feature switch for this worker. Default OFF: the queue is not subscribed and no remake is swept when unset. */
export const reaRemakeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.REA_REMAKE_ENABLED === '1';

/**
 * The edit's instruction, with the shot's own English description from the analysis for context. It takes nothing but the product from the photo: in the
 * 2026-11-13 A/B Wan also put the photo's model's necklace on the woman in the clip.
 */
const editPrompt = (shot: AnalysisShot): string =>
  `Replace the product shown in this video with the product in the reference image, reproducing its shape, colours, print and text faithfully. Take only the product from the reference image, not its model, jewellery, accessories or background. Keep everything else exactly as in the video: the people, faces, hair, hands, poses and every movement, the background, lighting and camera framing. The shot, for context: ${shot.prompt.slice(0, 1000)}`;

// The model, priced as @cvs/core/analysis/remake estimates: fal bills the clip sent as well as the clip made, so each billed second counts twice.
// It is not a model_configs row, so it does not show in Create.
const EDIT_MODEL: ModelConfig = {
  id: 'smart-remake-edit', provider: 'fal', endpoint: REMAKE_ENDPOINT, label: 'Wan 2.7 Edit', ratios: [], durationsSec: [],
  maxImages: 1, outputResolution: '720p', usdPerSecond: 2 * REMAKE_USD_PER_SECOND, billedAmountField: null, sources: {},
};

/**
 * The fal account new calls go to (fal-next.ts): the team's key once the personal account ran out, else the personal one. shortcut: a credit refusal
 * here fails the shot without switching accounts; the next video job's refusal switches them (falNext), and later remakes follow.
 */
const falKey = (account: FalAccount): string => {
  const key = account === 'team' && process.env.FAL_KEY_NEXT ? process.env.FAL_KEY_NEXT : process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY is not set');
  return key;
};

/** fal's queue answers within a few minutes; past this a call is given up and booked at its estimate, as fal may still run it. */
const CALL_DEADLINE_MS = 10 * 60_000;

/**
 * Polls one submitted fal request to its end and downloads the output. Every failure from here on carries the call's cost, since fal took the
 * request: its failed status's cost, the success's cost when the download fails, or the estimate past the deadline.
 */
export async function settleFal(
  status: () => Promise<ProviderStatus>,
  estimateUsd: number,
  o: { pollMs?: number; deadlineMs?: number; fetch?: typeof fetch } = {},
): Promise<{ bytes: Uint8Array; costUsd: number }> {
  const deadline = Date.now() + (o.deadlineMs ?? CALL_DEADLINE_MS);
  for (;;) {
    // A failed poll (network, 429) says nothing about the request, so it is polled again.
    const s = await status().catch(() => undefined);
    if (s?.state === 'succeeded') {
      try {
        const res = await (o.fetch ?? fetch)(s.outputUrl, { signal: AbortSignal.timeout(2 * 60_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { bytes: new Uint8Array(await res.arrayBuffer()), costUsd: s.costUsd };
      } catch (e) {
        throw new PaidCallError(`could not download the fal output: ${message(e)}`, s.costUsd);
      }
    }
    if (s?.state === 'failed' || s?.state === 'canceled') throw new PaidCallError(s.error, s.costUsd);
    if (Date.now() >= deadline) throw new PaidCallError(`fal did not finish within ${Math.round((o.deadlineMs ?? CALL_DEADLINE_MS) / 60_000)} minutes`, estimateUsd);
    await new Promise((r) => setTimeout(r, o.pollMs ?? 3_000));
  }
}

/** Both inputs go to fal storage from memory (fal.ts uploads them): the product shrunk as a job's inputs are, the clip as cut. */
const realEdit =
  (pool: Pool): NonNullable<RemakeSeams['edit']> =>
  async (clip, product, prompt, seconds, call) => {
    const readImage = async (url: string) => (url === 'mem:clip' ? { bytes: clip, contentType: 'video/mp4' } : fitForInline(product.bytes, product.contentType));
    const account = call.resume?.account ?? (await falActive(pool));
    // The start timeout is the poll deadline (settleFal): a request still queued when it is given up is dropped by fal, not run and billed unseen.
    const fal = createFalProvider({ apiKey: falKey(account), readImage, startTimeoutSec: CALL_DEADLINE_MS / 1000 });
    let providerJobId = call.resume?.providerJobId;
    if (!providerJobId) {
      ({ providerJobId } = await fal.submit({ model: EDIT_MODEL, prompt, imageUrls: ['mem:product', 'mem:clip'], ratio: 'auto', durationSec: seconds }));
      await call.saved(providerJobId, account);
    }
    const job = { providerJobId, model: EDIT_MODEL };
    const out = await settleFal(() => fal.status(job), EDIT_MODEL.usdPerSecond * seconds);
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
  await insertAssets(createDb(pool), [{ id, ownerId, kind: 'output', s3Key: `assets/${id}`, filename, mime: 'video/mp4', bytes: bytes.length, width, height }]);
  return id;
}

/**
 * Claims a queued remake, makes one clip per chosen shot, joins them and stores the outcome: 'succeeded' when every shot made a clip and they joined,
 * 'partial' when only some did (their clips stay viewable), 'failed' when none did. Safe to call more than once for the same id: only a `queued` row is claimed.
 * With `resume` (the state takeOverRemakes returns for a remake whose worker stopped) the row is already this worker's: finished shots are kept, a shot
 * with a saved fal request id is polled to its end and booked, and a shot with none fails instead of being submitted, as fal may have started it.
 */
export async function runRemake(pool: Pool, remakeId: string, seams: RemakeSeams = {}, resume?: RemakeState): Promise<void> {
  const read = seams.read ?? getObject;
  const write = seams.write ?? putObject;
  const edit = seams.edit ?? realEdit(pool);
  const workerId = seams.workerId ?? 'worker-local';

  if (!resume) {
    const claimed = (await pool.query(`update remakes set status = 'running', started_at = now(), result = jsonb_build_object('worker', $2::text) where id = $1 and status = 'queued'`, [remakeId, workerId])).rowCount;
    if (!claimed) return; // another worker claimed it, or it already ran
  }

  const shots: ShotResult[] = [];
  const spent = () => usd(shots.reduce((sum, s) => sum + s.costUsd, 0));
  const finish = (status: 'succeeded' | 'partial' | 'failed', outputAssetId: string | null, error: string | null, compareAssetId?: string) =>
    pool.query(
      `update remakes set status = $2, result = $3, output_asset_id = $4, cost_usd = $5, error = $6, finished_at = now() where id = $1 and status = 'running' and result->>'worker' = $7`,
      [remakeId, status, JSON.stringify({ shots, compareAssetId }), outputAssetId, spent(), error, workerId],
    );
  // Books the shot's paid call as soon as it returns or fails, so a stopped worker leaves at most the call in flight unbooked.
  const paid = async <T extends { costUsd: number }>(entry: ShotResult, call: () => Promise<T>): Promise<T> => {
    const book = async (costUsd: number) => {
      const ref = `${entry.index}:video`;
      await bookLlm(pool, { remake: remakeId, step: ref }, { costUsd, provider: 'fal', model: REMAKE_ENDPOINT }).catch((e) => {
        console.error(`worker: remake ${remakeId}: could not book ${costUsd} USD for ${ref}; the monthly fal invoice (invoice_diff) will carry it:`, e);
        throw e;
      });
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

  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'cvs-remake-'));
    const r = (
      await pool.query(
        `select r.user_id, r.shots, a.source_key, a.result, p.s3_key as product_key, p.mime as product_mime
           from remakes r join analyses a on a.id = r.analysis_id left join assets p on p.id = r.product_asset_id and p.deleted_at is null
          where r.id = $1`,
        [remakeId],
      )
    ).rows[0];
    const chosen = r.shots as number[];
    // The API checks these too; they are checked again before the first paid call, as the cap bounds a remake's spend and a repeated shot would reuse a ledger ref.
    if (chosen.length > REMAKE_MAX_SHOTS) throw new Error(`at most ${REMAKE_MAX_SHOTS} shots per remake`);
    if (new Set(chosen).size !== chosen.length) throw new Error('each shot may be chosen once');
    if (!r.product_key) throw new Error('the product image is no longer available');
    const video = join(dir, 'source.mp4');
    await writeFile(video, await read(r.source_key));
    const product = { bytes: await read(r.product_key), contentType: r.product_mime as string };
    const analysis = r.result as Analysis | null;
    // Each made shot's clip, and the cut it was made from, for the before/after.
    const made: { clip: string; sent: string }[] = [];

    for (const index of chosen) {
      const was = resume?.shots?.find((s) => s.index === index);
      if (was?.status === 'failed') {
        shots.push(was); // settled before the restart, with what it cost
        continue;
      }
      const entry: ShotResult = was ?? { index, status: 'failed', costUsd: 0 };
      try {
        // The whole scene the picker offered for this shot (shots joined by mergeShots), not just its first cut.
        const shot = analysis ? remakeScene(analysis, index) : undefined;
        if (!shot) throw new Error(`shot ${index} is not in the analysis`);
        const submitted = resume?.fal?.[String(index)];
        if (resume && !was && !submitted) throw new Error(`shot ${index} has no saved fal request id (the worker stopped before it was submitted or saved); it was not submitted again`);
        // Billed and made as whole seconds (2 to 10, padded with its last frame), then cut back to the shot's own length, at most 10 s. The cut sent
        // runs 0.1 s over (up to the 10 s the edit takes): fal measures a clip without its last frame, so an exact 2 s cut reads 1.96 s and is refused.
        const seconds = remakeShotSeconds(shot);
        const keep = Math.min(shot.end - shot.start, REMAKE_MAX_SECONDS);
        const send = Math.min(REMAKE_MAX_SECONDS, seconds + 0.1);
        const sent = join(dir, `shot-${index}.mp4`);
        await cutShot(video, shot.start, keep, send, sent);
        // A shot past the source's end cuts to nothing; nothing is paid for it.
        if ((await probeVideoSeconds(sent)) < send - 0.01) throw new Error(`shot ${index} is not in the video`);
        const clipBytes = new Uint8Array(await readFile(sent));
        const clip = join(dir, `clip-${index}.mp4`);
        if (was) {
          await writeFile(clip, await read(`assets/${was.clipAssetId}`)); // made and booked before the restart
        } else {
          // The request id is saved before the first poll, so a stopped worker's successor finds it; a save that fails is logged and the shot goes on, as it always did.
          const call: FalCall = {
            resume: submitted,
            saved: (providerJobId, account) =>
              pool
                .query(`update remakes set result = jsonb_set(result, '{fal}', coalesce(result->'fal', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)) where id = $1 and status = 'running' and result->>'worker' = $4`, [remakeId, String(index), JSON.stringify({ providerJobId, account }), workerId])
                .then(() => undefined, (e) => console.error(`worker: remake ${remakeId}: could not save the fal request ${providerJobId} for shot ${index}:`, e)),
          };
          const edited = await paid(entry, () => edit(clipBytes, product, editPrompt(shot), seconds, call));
          const raw = join(dir, `edited-${index}.mp4`);
          await writeFile(raw, edited.video);
          await trimClip(raw, keep, clip);
          entry.clipAssetId = await storeVideo(pool, write, r.user_id, clip, `remake-${remakeId.slice(0, 8)}-shot-${index}.mp4`);
          entry.status = 'succeeded';
        }
        made.push({ clip, sent });
      } catch (e) {
        // One shot's failure never stops the others; what it spent is already booked.
        entry.status = 'failed';
        entry.error = message(e);
      }
      shots.push(entry);
      const open = (await pool.query(`update remakes set result = coalesce(result, '{}'::jsonb) || $2::jsonb, cost_usd = $3 where id = $1 and status = 'running' and result->>'worker' = $4`, [remakeId, JSON.stringify({ shots }), spent(), workerId])).rowCount;
      if (!open) return; // the stale sweep closed it or another worker took it over: stop before another paid call
    }

    let outputAssetId: string | null = null;
    let compareAssetId: string | undefined;
    let error = shots.find((s) => s.error)?.error ?? null;
    if (made.length > 0) {
      try {
        const joined = join(dir, 'remake.mp4');
        await concatClips(made.map((m) => m.clip), joined);
        outputAssetId = await storeVideo(pool, write, r.user_id, joined, `remake-${remakeId.slice(0, 8)}.mp4`);
        // The before/after costs nothing more, so a failure here leaves the remake as it is.
        try {
          // Each source cut is trimmed to its remade clip's own length, so the two sides stay in step shot after shot.
          const befores: string[] = [];
          for (const [i, m] of made.entries()) {
            befores.push(join(dir, `before-${i}.mp4`));
            await trimClip(m.sent, await probeVideoSeconds(m.clip), befores[i]!);
          }
          const before = join(dir, 'before.mp4');
          const compare = join(dir, 'compare.mp4');
          await concatClips(befores, before);
          await sideBySide(before, joined, compare);
          compareAssetId = await storeVideo(pool, write, r.user_id, compare, `remake-${remakeId.slice(0, 8)}-before-after.mp4`);
        } catch (e) {
          console.error(`worker: remake ${remakeId}: no before/after video:`, e);
        }
      } catch (e) {
        error = `the clips could not be joined: ${message(e)}`;
      }
    }
    await finish(made.length === 0 ? 'failed' : made.length === chosen.length && outputAssetId ? 'succeeded' : 'partial', outputAssetId, error, compareAssetId);
  } catch (e) {
    await finish(shots.some((s) => s.status === 'succeeded') ? 'partial' : 'failed', null, message(e));
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Takes over the running remakes whose worker stopped (no heartbeat for `staleMs`): they now belong to `workerId`, and the caller resumes each one with
 * runRemake. One statement, so two workers never take the same remake. A remake with no worker in `result` (started before workers were recorded) is left to closeStaleRemakes.
 */
export async function takeOverRemakes(pool: Pool, workerId: string, staleMs: number): Promise<{ id: string; resume: RemakeState }[]> {
  const { rows } = await pool.query(
    `update remakes r set result = jsonb_set(r.result, '{worker}', to_jsonb($1::text))
      where r.status = 'running' and r.result->>'worker' <> $1
        and not exists (select 1 from worker_heartbeat h where h.worker_id = r.result->>'worker' and h.beat_at > now() - ($2::float8 * interval '1 millisecond'))
      returning r.id, r.result`,
    [workerId, staleMs],
  );
  return rows.map((r) => ({ id: r.id as string, resume: r.result as RemakeState }));
}

/** Longer than any remake can run: the queue's expiry, which covers the longest one, and a margin. */
const STALE_AFTER_MS = REMAKE_QUEUE_OPTIONS.expireInSeconds * 1000 + 10 * 60_000;

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

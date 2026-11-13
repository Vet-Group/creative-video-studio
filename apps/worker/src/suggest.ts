// Marketing Studio suggestions (packages/core/src/suggest.ts): one run per queue job, written back to suggestion_runs for the page to poll.
import { bookLlm, withTransaction } from '@cvs/core/ledger';
import { SUGGEST_EXPIRY_SECONDS } from '@cvs/core/queue';
import { type SuggestInput, type Suggester, VIDEO_FRAMES, videoPrompt } from '@cvs/core/suggest';
import sharp from 'sharp';
import { extractFrames } from './media';
import { getObject } from './storage';
import type { WorkerDeps } from './worker';

/**
 * Answers one queued run: its options and LLM cost, or `failed`. A run older than the page waits for is left alone (the page has marked it
 * failed), and a run is only ever written while still queued, so a late answer cannot overwrite the page's verdict. A run with a `clip` reads
 * it from the bucket (`read`) and sends its stills.
 */
export async function runSuggestion(pool: WorkerDeps['pool'], suggest: Suggester | undefined, runId: string, read: (key: string) => Promise<Uint8Array> = getObject): Promise<void> {
  const run = (await pool.query(`select input from suggestion_runs where id = $1 and status = 'queued' and created_at > now() - make_interval(secs => $2)`, [runId, SUGGEST_EXPIRY_SECONDS])).rows[0];
  if (!run) return;
  try {
    if (!suggest) throw new Error('no suggester: FAL_KEY is not set');
    const input = run.input as SuggestInput;
    const clip = input.clip ? await extractFrames(await read(`samples/${input.clip}`), VIDEO_FRAMES) : undefined;
    // A scenes run sends the member's product, then one still per scene of the reference video.
    const scenes = input.field === 'scenes' ? await extractFrames(await read(input.sourceKey!), input.times!) : undefined;
    const product = scenes ? await sharp(await read(input.productKey!)).resize(512, 512, { fit: 'inside' }).jpeg().toBuffer() : undefined;
    const still = (b: Uint8Array) => `data:image/jpeg;base64,${Buffer.from(b).toString('base64')}`;
    // The clip's length goes with its stills so the call can say when each was taken.
    const call = await suggest(clip ? { ...input, seconds: clip.seconds } : input, clip ? clip.stills.map(still) : scenes && product ? [product, ...scenes.stills].map(still) : undefined);
    const { options, meanings, costUsd } = call;
    // An option with a Vietnamese reading is stored as { text, vi }, one without as its text (as every run before the readings).
    const output = options.map((text, i) => (meanings?.[i] ? { text, vi: meanings[i] } : text));
    // fal billed the call even when the page has given up on the run, so the ledger row is booked either way.
    await withTransaction(pool, async (tx) => {
      await tx.query(`update suggestion_runs set status = 'succeeded', output = $2, cost_usd = $3 where id = $1 and status = 'queued'`, [runId, JSON.stringify(output), costUsd]);
      await bookLlm(tx, { suggestion: runId }, call);
    });
  } catch (e) {
    await pool.query(`update suggestion_runs set status = 'failed' where id = $1 and status = 'queued'`, [runId]);
    throw e;
  }
}

/**
 * The e2e worker's stand-in (CVS_FAKE_SUGGEST=1, never with a fal key): three numbered options built from the input with their readings, one
 * translation, or one preset prompt that counts the stills it got; no network.
 */
export const fakeSuggester: Suggester = async (i, frames) =>
  i.field === 'translate'
    ? { options: [`Translation: ${i.text}`], costUsd: 0, provider: 'mock', model: 'fake' }
    : i.field === 'scenes'
      ? { options: (i.times ?? []).slice(0, 2).map((_, k) => String(k + 1)), costUsd: 0, provider: 'mock', model: 'fake' } // the first two scenes
      : i.field === 'video'
        ? { options: [videoPrompt({ motion: `Mock motion read from ${frames?.length ?? 0} stills: the camera pushes in slowly on the model.`, person: true, stable: true }, i.max)], costUsd: 0, provider: 'mock', model: 'fake' }
        : { options: [1, 2, 3].map((n) => `Option ${n}: ${i.text || i.field}`.slice(0, i.max)), meanings: [1, 2, 3].map((n) => `Reading ${n}: ${i.text || i.field}`), costUsd: 0, provider: 'mock', model: 'fake' };

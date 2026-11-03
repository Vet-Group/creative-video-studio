// Marketing Studio suggestions (packages/core/src/suggest.ts): one run per queue job, written back to suggestion_runs for the page to poll.
import { bookLlm, withTransaction } from '@cvs/core/ledger';
import { SUGGEST_EXPIRY_SECONDS } from '@cvs/core/queue';
import type { SuggestInput, Suggester } from '@cvs/core/suggest';
import type { WorkerDeps } from './worker';

/**
 * Answers one queued run: its options and LLM cost, or `failed`. A run older than the page waits for is left alone (the page has marked it
 * failed), and a run is only ever written while still queued, so a late answer cannot overwrite the page's verdict.
 */
export async function runSuggestion(pool: WorkerDeps['pool'], suggest: Suggester | undefined, runId: string): Promise<void> {
  const run = (await pool.query(`select input from suggestion_runs where id = $1 and status = 'queued' and created_at > now() - make_interval(secs => $2)`, [runId, SUGGEST_EXPIRY_SECONDS])).rows[0];
  if (!run) return;
  try {
    if (!suggest) throw new Error('no suggester: FAL_KEY is not set');
    const call = await suggest(run.input as SuggestInput);
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

/** The e2e worker's stand-in (CVS_FAKE_SUGGEST=1, never with a fal key): three numbered options built from the input with their readings, or one translation; no network. */
export const fakeSuggester: Suggester = async (i) =>
  i.field === 'translate'
    ? { options: [`Translation: ${i.text}`], costUsd: 0, provider: 'mock', model: 'fake' }
    : { options: [1, 2, 3].map((n) => `Option ${n}: ${i.text || i.field}`.slice(0, i.max)), meanings: [1, 2, 3].map((n) => `Reading ${n}: ${i.text || i.field}`), costUsd: 0, provider: 'mock', model: 'fake' };

// Marketing Studio suggestions (packages/core/src/suggest.ts): one run per queue job, written back to suggestion_runs for the page to poll.
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
    const { options, costUsd } = await suggest(run.input as SuggestInput);
    await pool.query(`update suggestion_runs set status = 'succeeded', output = $2, cost_usd = $3 where id = $1 and status = 'queued'`, [runId, JSON.stringify(options), costUsd]);
  } catch (e) {
    await pool.query(`update suggestion_runs set status = 'failed' where id = $1 and status = 'queued'`, [runId]);
    throw e;
  }
}

/** The e2e worker's stand-in (CVS_FAKE_SUGGEST=1, never with a fal key): three numbered options built from the input, no network. */
export const fakeSuggester: Suggester = async (i) => ({
  options: [1, 2, 3].map((n) => `Option ${n}: ${i.text || i.field}`.slice(0, i.max)),
  costUsd: 0,
});

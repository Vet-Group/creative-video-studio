import { randomUUID } from 'node:crypto';
import { SUGGEST_QUEUE } from '@cvs/core/queue';
import { PROMPT_CEILING } from '@cvs/core/models';
import type { SuggestInput } from '@cvs/core/suggest';
import { pool } from '@/lib/auth';
import { ADVANCED_MAX_SCRIPT, HOOKS, LOCATIONS, SUGGEST_DAILY_LIMIT } from '@/lib/marketing';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/**
 * Asks the worker for three Marketing Studio suggestions: `field` (`brief`, or `script` on Advanced), `format` ('advanced' or absent), the
 * member's `text` so far, the chosen `hook` and `location`, and for a brief the `room` the chosen model leaves for it (the page computes it). Answers 202 with the run's id for the page to poll (GET /api/suggestions/:id),
 * 429 past the daily limit, 503 when the queue cannot take it (the run is not counted then).
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await request.json().catch(() => null)) as { field?: unknown; format?: unknown; text?: unknown; hook?: unknown; location?: unknown; room?: unknown } | null;
  if (b?.field !== 'brief' && b?.field !== 'script') return bad('field must be brief or script');
  if (b.format !== undefined && b.format !== 'advanced') return bad('format must be advanced or left out');
  const advanced = b.format === 'advanced';
  if (b.field === 'script' && !advanced) return bad('a script is for Advanced only');
  if (b.room !== undefined && !(Number.isInteger(b.room) && (b.room as number) >= 1)) return bad('room must be a whole number of characters');
  // The member's notes may be the brief even when lines are asked for, so they are held to the longest prompt; `max` is the options' own limit.
  const max = b.field === 'script' ? ADVANCED_MAX_SCRIPT : Math.min((b.room as number | undefined) ?? PROMPT_CEILING, PROMPT_CEILING);
  const text = typeof b.text === 'string' ? b.text.trim() : b.text === undefined ? '' : null;
  if (text === null || text.length > PROMPT_CEILING) return bad(`text may be at most ${PROMPT_CEILING} characters`);
  const hook = b.hook === undefined ? undefined : HOOKS.find((h) => h.id === b.hook);
  if (b.hook !== undefined && !hook) return bad('hook is not a hook');
  const location = b.location === undefined ? undefined : LOCATIONS.find((l) => l.id === b.location);
  if (b.location !== undefined && !location) return bad('location is not a location');
  const input: SuggestInput = { field: b.field, text, context: [hook?.phrase, location && `Set in ${location.phrase}.`].filter(Boolean).join(' '), max };

  const userId = g.session.user.id;
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('suggest:' || $1))`, [userId]); // two clicks cannot both take the 20th
    const { n } = (
      await client.query(
        `select count(*)::int as n from suggestion_runs where user_id = $1
            and (created_at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date`,
        [userId],
      )
    ).rows[0];
    if (n >= SUGGEST_DAILY_LIMIT) {
      await client.query('rollback');
      return bad(`Bạn đã dùng hết ${SUGGEST_DAILY_LIMIT} lượt gợi ý hôm nay. Mai hãy thử lại.`, 429); // shown to the member as written
    }
    await client.query('insert into suggestion_runs (id, user_id, input) values ($1, $2, $3)', [id, userId, JSON.stringify(input)]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  try {
    await (await boss()).send(SUGGEST_QUEUE, { runId: id });
  } catch (e) {
    console.error(`Could not send suggestion run ${id} to the queue:`, e);
    await pool.query('delete from suggestion_runs where id = $1', [id]);
    return bad('suggestions are unavailable right now', 503);
  }
  return Response.json({ id, status: 'queued' }, { status: 202 });
}

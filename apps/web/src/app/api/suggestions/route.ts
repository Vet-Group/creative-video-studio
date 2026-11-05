import { randomUUID } from 'node:crypto';
import { SUGGEST_QUEUE } from '@cvs/core/queue';
import { PROMPT_CEILING } from '@cvs/core/models';
import { modelNote, PROMPT_TASKS, type SuggestInput } from '@cvs/core/suggest';
import { pool } from '@/lib/auth';
import { findChoice } from '@/lib/choices';
import { ADVANCED_MAX_SCRIPT, MAX_CHOICE_DESC, MAX_CHOICE_NAME, MAX_CHOICE_PHRASE, MAX_ENDING, MAX_HOOK, SUGGEST_DAILY_LIMIT } from '@/lib/marketing';
import { boss } from '@/lib/queue';
import { headSample } from '@/lib/samples';
import { guard, isEditor } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/**
 * Asks the worker for three Marketing Studio suggestions: `field` (`brief`, `script` on Advanced, or `hook`, `location` or `ending` for the English scene of
 * a new one from its Vietnamese name and description in `text`; with `rest`, the prompt's other sections, `hook` or `ending` is a sectioned prompt's
 * hook or last shot, from the member's own words in `text` (which may be empty) and written for the page's model and pace; `prompt` for the English prompt of the tool `feature`, a PROMPT_TASKS key, or `translate`
 * for one Vietnamese reading of the English prompt in `text`), `format` ('advanced' or absent), the
 * member's `text` so far, the chosen `hook` and `location`, and for a brief the `room` the chosen model leaves for it (the page computes it); for a
 * brief, a script or a prompt, the page's chosen `model` (an enabled model's id), its `audio` switch and the clip's `seconds`, when it has them;
 * or `video` for a template editor only: the English prompt of the motion preset `preset`, from stills of its saved clip. Answers 202 with the run's id for the page to poll (GET /api/suggestions/:id),
 * 429 past the daily limit, 503 when the queue cannot take it (the run is not counted then).
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await request.json().catch(() => null)) as {
    field?: unknown; format?: unknown; feature?: unknown; text?: unknown; hook?: unknown; location?: unknown; room?: unknown; model?: unknown; audio?: unknown; seconds?: unknown; preset?: unknown; rest?: unknown;
  } | null;
  if (b?.field !== 'brief' && b?.field !== 'script' && b?.field !== 'hook' && b?.field !== 'location' && b?.field !== 'ending' && b?.field !== 'prompt' && b?.field !== 'translate' && b?.field !== 'video') {
    return bad('field must be brief, script, hook, location, ending, prompt, translate or video');
  }
  if (b.field === 'video') {
    // The prompt-from-video button in the preset edit form: a vision call on the preset's saved clip, for the people who edit presets.
    if (!isEditor(g.session.user)) return bad('forbidden', 403);
    const preset = typeof b.preset === 'string' ? (await pool.query('select id from presets where id = $1', [b.preset])).rows[0] : undefined;
    if (!preset) return bad('preset is not a preset');
    const clip = `preset-${preset.id}.mp4`;
    if (!(await headSample(clip))) return bad('the preset has no clip');
    return queue(g.session.user.id, { field: 'video', text: '', context: '', max: PROMPT_CEILING, clip });
  }
  if (b.field === 'translate') {
    // The Translate button: a Vietnamese reading of an English prompt, for the member to read; it counts as a run like any other.
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!text || text.length > PROMPT_CEILING) return bad(`text must be 1 to ${PROMPT_CEILING} characters`);
    return queue(g.session.user.id, { field: 'translate', text, context: '', max: PROMPT_CEILING * 2 });
  }
  if (b.field === 'prompt') {
    // Any other page's prompt: the tool's task is the server's own text, so the member's words only ever reach the model as their notes.
    const task = typeof b.feature === 'string' && Object.hasOwn(PROMPT_TASKS, b.feature) ? PROMPT_TASKS[b.feature as keyof typeof PROMPT_TASKS] : undefined;
    if (!task) return bad(`feature must be one of ${Object.keys(PROMPT_TASKS).join(', ')}`);
    if (b.room !== undefined && !(Number.isInteger(b.room) && (b.room as number) >= 1)) return bad('room must be a whole number of characters');
    const text = typeof b.text === 'string' ? b.text.trim() : b.text === undefined ? '' : null;
    if (text === null || text.length > PROMPT_CEILING) return bad(`text may be at most ${PROMPT_CEILING} characters`);
    const extra = await modelAndPace(b);
    if (typeof extra === 'string') return bad(extra);
    return queue(g.session.user.id, { field: 'prompt', task, text, context: '', max: Math.min((b.room as number | undefined) ?? PROMPT_CEILING, PROMPT_CEILING), ...extra });
  }
  if ((b.field === 'hook' || b.field === 'ending') && b.rest !== undefined) {
    // A sectioned prompt's Hook or Ending section: the member's words so far, as long as the section takes, and the other sections as the context.
    const max = b.field === 'hook' ? MAX_HOOK : MAX_ENDING;
    const text = typeof b.text === 'string' ? b.text.trim() : b.text === undefined ? '' : null;
    if (text === null || text.length > max) return bad(`text may be at most ${max} characters`);
    if (typeof b.rest !== 'string' || b.rest.length > PROMPT_CEILING) return bad(`rest must be text of at most ${PROMPT_CEILING} characters`);
    const extra = await modelAndPace(b);
    if (typeof extra === 'string') return bad(extra);
    return queue(g.session.user.id, { field: b.field, text, context: b.rest.trim(), max, ...extra });
  }
  if (b.field === 'hook' || b.field === 'location' || b.field === 'ending') {
    // The add form's AI help: the English scene of a new hook, location or ending from its Vietnamese name and description, as long as the field takes.
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!text || text.length > MAX_CHOICE_NAME + MAX_CHOICE_DESC + 3) return bad(`text must be the name and description, 1 to ${MAX_CHOICE_NAME + MAX_CHOICE_DESC + 3} characters`);
    return queue(g.session.user.id, { field: b.field, text, context: '', max: b.field === 'ending' ? MAX_ENDING : MAX_CHOICE_PHRASE });
  }
  if (b.format !== undefined && b.format !== 'advanced') return bad('format must be advanced or left out');
  const advanced = b.format === 'advanced';
  if (b.field === 'script' && !advanced) return bad('a script is for Advanced only');
  if (b.room !== undefined && !(Number.isInteger(b.room) && (b.room as number) >= 1)) return bad('room must be a whole number of characters');
  // The member's notes may be the brief even when lines are asked for, so they are held to the longest prompt; `max` is the options' own limit.
  const max = b.field === 'script' ? ADVANCED_MAX_SCRIPT : Math.min((b.room as number | undefined) ?? PROMPT_CEILING, PROMPT_CEILING);
  const text = typeof b.text === 'string' ? b.text.trim() : b.text === undefined ? '' : null;
  if (text === null || text.length > PROMPT_CEILING) return bad(`text may be at most ${PROMPT_CEILING} characters`);
  const userId = g.session.user.id;
  // A built-in hook or location, or the member's own or a company one (lib/choices.ts).
  const hook = typeof b.hook === 'string' ? await findChoice(userId, 'hook', b.hook) : undefined;
  if (b.hook !== undefined && !hook) return bad('hook is not a hook');
  const location = typeof b.location === 'string' ? await findChoice(userId, 'location', b.location) : undefined;
  if (b.location !== undefined && !location) return bad('location is not a location');
  const extra = await modelAndPace(b);
  if (typeof extra === 'string') return bad(extra);
  const input: SuggestInput = { field: b.field, text, context: [hook?.phrase, location && `Set in ${location.phrase}.`].filter(Boolean).join(' '), max, ...extra };

  return queue(userId, input);
}

/**
 * The chosen model's note (its name, how to write for it and whether the clip has sound) and the clip's length, or the error. Only an enabled
 * model is named to the LLM, so the member's request never reaches it as words.
 */
async function modelAndPace(b: { model?: unknown; audio?: unknown; seconds?: unknown }): Promise<Pick<SuggestInput, 'model' | 'seconds'> | string> {
  if (b.audio !== undefined && typeof b.audio !== 'boolean') return 'audio must be true or false';
  if (b.seconds !== undefined && !(Number.isInteger(b.seconds) && (b.seconds as number) >= 1 && (b.seconds as number) <= 60)) return 'seconds must be a whole number from 1 to 60';
  if (b.model === undefined) return { ...(b.seconds !== undefined && { seconds: b.seconds as number }) };
  const model = typeof b.model === 'string' ? (await pool.query('select id, label, endpoint from model_configs where id = $1 and enabled', [b.model])).rows[0] : undefined;
  if (!model) return 'model is not an enabled model';
  return { model: modelNote(model, b.audio === true), ...(b.seconds !== undefined && { seconds: b.seconds as number }) };
}

/** Counts the run against the member's daily limit, stores it and hands it to the worker. */
async function queue(userId: string, input: SuggestInput): Promise<Response> {
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

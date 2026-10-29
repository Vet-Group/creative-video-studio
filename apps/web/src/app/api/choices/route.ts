import { randomUUID } from 'node:crypto';
import { CHOICE_KINDS, type ChoiceKind } from '@cvs/db';
import { pool } from '@/lib/auth';
import { HOOKS, LOCATIONS, MAX_CHOICE_DESC, MAX_CHOICE_NAME, MAX_CHOICE_PHRASE, MAX_CHOICES } from '@/lib/marketing';
import { guard } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
/** The most ids one often-used list holds. */
const OFTEN_MAX = 12;
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u; // newlines and other control characters would break the one-line prompt

/**
 * The Marketing Studio pickers' own lists: the caller's hooks and locations, then the company's, newest first in each; `often` (the often-used group), the ids
 * of the hooks and locations the caller's own `marketing` jobs of that format (`?format=advanced`, else UGC) used at least twice in 90 days, retries
 * and deleted jobs left out, most used first, only ids still in the lists; `canShare` for an Admin.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const format = new URL(request.url).searchParams.get('format');
  if (format !== null && format !== 'advanced') return bad('format must be advanced or left out');
  const userId = g.session.user.id;
  const [own, used] = await Promise.all([
    pool.query(
      `select id, kind, name, description, phrase, is_company, user_id = $1 as mine from user_choices where user_id = $1 or is_company
        order by (user_id = $1) desc, created_at desc, id`,
      [userId],
    ),
    pool.query(
      `select c.kind, c.id from jobs j, lateral (values ('hook', j.params->>'hook'), ('location', j.params->>'location')) as c (kind, id)
        where j.user_id = $1 and j.feature = 'marketing' and coalesce(j.params->>'format' = 'advanced', false) = $2 and j.retry_of is null and j.deleted_at is null
          and j.created_at > now() - interval '90 days' and c.id is not null
        group by c.kind, c.id having count(*) >= 2 order by count(*) desc, max(j.created_at) desc`,
      [userId, format === 'advanced'],
    ),
  ]);
  const choices = own.rows.map((r) => ({ kind: r.kind as ChoiceKind, id: r.id as string, name: r.name, desc: r.description ?? '', phrase: r.phrase, isCompany: r.is_company, mine: r.mine }));
  const of = (kind: ChoiceKind) => choices.filter((c) => c.kind === kind).map(({ kind: _, ...c }) => c);
  const [hooks, locations] = [of('hook'), of('location')];
  const often = (kind: ChoiceKind, list: { id: string }[]) => {
    const known = new Set(list.map((c) => c.id));
    return used.rows.filter((r) => r.kind === kind && known.has(r.id)).slice(0, OFTEN_MAX).map((r) => r.id as string);
  };
  return Response.json({ hooks, locations, often: { hook: often('hook', [...HOOKS, ...hooks]), location: often('location', [...LOCATIONS, ...locations]) }, canShare: g.session.user.role === 'admin' });
}

/**
 * Adds one of the caller's own hooks or locations: `kind`, `name` (1 to 40 characters), `phrase` (the English words the prompt takes, 1 to 300), an
 * optional `desc` (up to 100) and `isCompany` (Admin only) to share it; none may hold a newline or another control character. A member keeps at
 * most 50 of each kind.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await request.json().catch(() => null)) as { kind?: unknown; name?: unknown; phrase?: unknown; desc?: unknown; isCompany?: unknown } | null;
  const kind = b?.kind as ChoiceKind;
  if (!CHOICE_KINDS.includes(kind)) return bad('kind must be hook or location');
  const text = (v: unknown, max: number, min = 1) => (typeof v === 'string' && !CONTROL.test(v) && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
  const name = text(b?.name, MAX_CHOICE_NAME);
  if (name === null) return bad(`name must have 1 to ${MAX_CHOICE_NAME} characters on one line`);
  const phrase = text(b?.phrase, MAX_CHOICE_PHRASE);
  if (phrase === null) return bad(`phrase must have 1 to ${MAX_CHOICE_PHRASE} characters on one line`);
  const desc = b?.desc === undefined ? '' : text(b.desc, MAX_CHOICE_DESC, 0);
  if (desc === null) return bad(`desc may have at most ${MAX_CHOICE_DESC} characters on one line`);
  if (b?.isCompany !== undefined && typeof b.isCompany !== 'boolean') return bad('isCompany must be true or false');
  const isCompany = b?.isCompany === true;
  if (isCompany && g.session.user.role !== 'admin') return bad('only an Admin shares a hook or location with the company', 403);
  const userId = g.session.user.id;
  const id = randomUUID();
  // One writer per member, so two adds cannot both take the 50th place (the shape of POST /api/templates).
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('choices:' || $1))`, [userId]);
    const count = (await client.query('select count(*)::int as n from user_choices where user_id = $1 and kind = $2', [userId, kind])).rows[0].n;
    if (count >= MAX_CHOICES) {
      await client.query('rollback');
      return bad(`you can keep at most ${MAX_CHOICES} ${kind}s; delete one first`, 409);
    }
    await client.query('insert into user_choices (id, user_id, kind, name, phrase, description, is_company) values ($1, $2, $3, $4, $5, $6, $7)', [id, userId, kind, name, phrase, desc || null, isCompany]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return Response.json({ id, kind, name, desc, phrase, isCompany }, { status: 201 });
}

import { randomUUID } from 'node:crypto';
import { CHOICE_KINDS, type ChoiceKind } from '@cvs/db';
import { pool } from '@/lib/auth';
import { CHOICE_SQL, choiceFields, listedChoice, type ListedChoice } from '@/lib/choices';
import { LIVE_CLIP } from '@/lib/clips';
import { BUILT_IN_CHOICES, MAX_CHOICES } from '@/lib/marketing';
import { guard, isEditor } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
/** The most ids one often-used list holds. */
const OFTEN_MAX = 12;
const LISTS = { hook: 'hooks', location: 'locations', ending: 'endings' } as const;

/**
 * The pickers' lists of hooks, locations and endings, each choice with its `group`: the stores' (`?storeId=` keeps that store's only; a hidden store's
 * never show), the company's and the caller's own private ones, the caller's first, newest first, then the built-in ones; `?kind=` fills that list only,
 * `?niche=` keeps the entries with that niche tag (so no built-in one). `often` (the often-used group), the ids of the hooks and locations the caller's
 * own `marketing` jobs of that format (`?format=advanced`, else UGC) used at least twice in 90 days, retries and deleted jobs left out, most used first,
 * only ids still in the lists; `posters`, for each often-used id, the poster asset of the caller's latest live clip with it (none when every such clip is
 * gone), the card's picture when it has no sample; `canShare` for a template editor (an Admin too), who shares with the company and edits or deletes
 * shared entries.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const params = new URL(request.url).searchParams;
  const format = params.get('format');
  if (format !== null && format !== 'advanced') return bad('format must be advanced or left out');
  const kind = params.get('kind') as ChoiceKind | null;
  if (kind !== null && !CHOICE_KINDS.includes(kind)) return bad('kind must be hook, location or ending');
  const niche = params.get('niche') || null;
  const userId = g.session.user.id;
  const [rows, used, latest] = await Promise.all([
    pool.query(
      `${CHOICE_SQL}
        where ((c.store_id is null and (c.is_company or c.user_id = $1)) or (not s.hidden and ($2::text is null or c.store_id = $2)))
          and ($3::text is null or c.kind = $3) and ($4::text is null or c.niche = $4)
        order by (c.user_id = $1) desc, c.created_at desc, c.id`,
      [userId, params.get('storeId') || null, kind, niche],
    ),
    pool.query(
      `select c.kind, c.id from jobs j, lateral (values ('hook', j.params->>'hook'), ('location', j.params->>'location')) as c (kind, id)
        where j.user_id = $1 and j.feature = 'marketing' and coalesce(j.params->>'format' = 'advanced', false) = $2 and j.retry_of is null and j.deleted_at is null
          and j.created_at > now() - interval '90 days' and c.id is not null
        group by c.kind, c.id having count(*) >= 2 order by count(*) desc, max(j.created_at) desc`,
      [userId, format === 'advanced'],
    ),
    pool.query(
      `select distinct on (c.kind, c.id) c.kind, c.id, j.poster_asset_id from jobs j join assets p on p.id = j.poster_asset_id and p.deleted_at is null,
              lateral (values ('hook', j.params->>'hook'), ('location', j.params->>'location')) as c (kind, id)
        where j.user_id = $1 and j.feature = 'marketing' and coalesce(j.params->>'format' = 'advanced', false) = $2 and ${LIVE_CLIP} and c.id is not null
        order by c.kind, c.id, j.created_at desc, j.id desc`,
      [userId, format === 'advanced'],
    ),
  ]);
  const choices = rows.rows.map(listedChoice);
  const builtIn = (k: ChoiceKind): ListedChoice[] =>
    niche ? [] : BUILT_IN_CHOICES[k].map((c) => ({ ...c, kind: k, group: 'builtin', isCompany: false, mine: false, storeId: null, storeName: null, niche: null, imageAssetId: null }));
  const lists = Object.fromEntries(
    CHOICE_KINDS.map((k) => [k, kind !== null && kind !== k ? [] : [...choices.filter((c) => c.kind === k), ...builtIn(k)].map(({ kind: _, ...c }) => c)]),
  ) as Record<ChoiceKind, Omit<ListedChoice, 'kind'>[]>;
  const often = Object.fromEntries(
    CHOICE_KINDS.map((k) => {
      const known = new Set(lists[k].map((c) => c.id));
      return [k, used.rows.filter((r) => r.kind === k && known.has(r.id)).slice(0, OFTEN_MAX).map((r) => r.id as string)];
    }),
  ) as Record<ChoiceKind, string[]>;
  const posters = Object.fromEntries(
    CHOICE_KINDS.map((k) => [k, Object.fromEntries(latest.rows.filter((r) => r.kind === k && often[k].includes(r.id)).map((r) => [r.id as string, r.poster_asset_id as string]))]),
  );
  return Response.json({ ...Object.fromEntries(CHOICE_KINDS.map((k) => [LISTS[k], lists[k]])), often, posters, canShare: isEditor(g.session.user) });
}

/**
 * Adds one of the caller's own hooks, locations or endings: `kind` and the fields lib/choices.ts choiceFields reads (name, phrase, desc, niche, the share
 * level and the photo). A member keeps at most 50 of each kind, private and store ones together, so no one fills a store's list; company ones (an editor's) do not count. Answers with the choice as GET lists it.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = b?.kind as ChoiceKind;
  if (!b || !CHOICE_KINDS.includes(kind)) return bad('kind must be hook, location or ending');
  const f = await choiceFields(b, g.session.user);
  if ('error' in f) return bad(f.error, f.status);
  const userId = g.session.user.id;
  const id = randomUUID();
  // One writer per member, so two adds cannot both take the 50th place (the shape of POST /api/templates).
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('choices:' || $1))`, [userId]);
    const count = (await client.query('select count(*)::int as n from user_choices where user_id = $1 and kind = $2 and not is_company', [userId, kind])).rows[0].n;
    if (!f.isCompany && count >= MAX_CHOICES) {
      await client.query('rollback');
      return bad(`you can keep at most ${MAX_CHOICES} ${kind}s; delete one first`, 409);
    }
    await client.query(
      'insert into user_choices (id, user_id, kind, name, phrase, description, is_company, store_id, niche, image_asset_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [id, userId, kind, f.name, f.phrase, f.desc || null, f.isCompany, f.storeId, f.niche, f.imageAssetId],
    );
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return Response.json(listedChoice((await pool.query(`${CHOICE_SQL} where c.id = $2`, [userId, id])).rows[0]), { status: 201 });
}

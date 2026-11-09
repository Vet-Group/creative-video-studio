import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { EXAMPLE_ORDER, LIVE_CLIP } from '@/lib/clips';
import { GALLERY_SAMPLES } from '@/lib/examples';
import { guard } from '@/lib/session';

const MAX = 500;
const badFeature = () => Response.json({ error: `feature must be one of ${Object.keys(GALLERY_SAMPLES).join(', ')}` }, { status: 400 });

/** The results on one page's Examples tab (`?feature=image|try_on|marketing`) in the tab's order, for an Admin to reorder. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const feature = new URL(request.url).searchParams.get('feature') ?? '';
  if (!Object.hasOwn(GALLERY_SAMPLES, feature)) return badFeature();
  const { rows } = await pool.query(
    `select j.id, j.output_asset_id, j.poster_asset_id, j.aspect, m.label as model_label
       from examples e join jobs j on j.id = e.job_id join model_configs m on m.id = j.model
      where ${LIVE_CLIP} and j.feature = $1
      order by ${EXAMPLE_ORDER}`,
    [feature],
  );
  return Response.json({ examples: rows.map((r) => ({ id: r.id, videoAssetId: r.output_asset_id, posterAssetId: r.poster_asset_id, ratio: r.aspect, modelLabel: r.model_label })) });
}

/**
 * Sets the order of a page's Examples tab: `{ feature, ids }`, every result on it exactly once, first to last. Admin only, audited.
 * 409 when the tab changed since it was read (one added, removed or deleted), so an old list never drops or misplaces one.
 */
export async function PUT(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const body = (await readJson(request)) as { feature?: unknown; ids?: unknown } | null;
  const feature = typeof body?.feature === 'string' ? body.feature : '';
  if (!Object.hasOwn(GALLERY_SAMPLES, feature)) return badFeature();
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length > MAX || !ids.every((i) => typeof i === 'string') || new Set(ids).size !== ids.length)
    return Response.json({ error: `ids must be distinct result ids, at most ${MAX}` }, { status: 400 });
  const userId = g.session.user.id;
  return withTransaction(pool, async (tx): Promise<Response> => {
    // One order at a time per tab, taken before the read, so a second Admin reads the first one's saved order.
    await tx.query(`select pg_advisory_xact_lock(hashtext('example.order:' || $1))`, [feature]);
    const { rows } = await tx.query(`select e.job_id from examples e join jobs j on j.id = e.job_id where ${LIVE_CLIP} and j.feature = $1 order by ${EXAMPLE_ORDER}`, [feature]);
    const before = rows.map((r) => r.job_id as string);
    if (before.length !== ids.length || !ids.every((i) => before.includes(i))) return Response.json({ error: 'the Examples tab changed; reload it and order it again' }, { status: 409 });
    await tx.query('update examples e set position = x.n from unnest($1::text[]) with ordinality as x(id, n) where e.job_id = x.id', [ids]);
    if (before.some((id, n) => id !== ids[n])) await audit(tx, { actorId: userId, action: 'example.order', target: `feature:${feature}`, oldValue: { ids: before }, newValue: { ids } });
    return Response.json({ ids });
  });
}

import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import type { RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { LIVE_CLIP, OWN_PROMPT } from '@/lib/clips';
import { GALLERY_SAMPLES } from '@/lib/examples';
import { guard } from '@/lib/session';

/**
 * What an Admin checks before putting a result on its page's Examples tab: the results already there for the same feature, those that may repeat it
 * first. `match` is `inputs` when one shares an input photo with it (the same asset or the same bytes), `prompt` when it has the same own words, else null.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const job = (await pool.query(`select j.id, j.feature, j.input_asset_ids, ${OWN_PROMPT} as prompt from jobs j where j.id = $1 and ${LIVE_CLIP}`, [id])).rows[0];
  if (!job) return Response.json({ error: 'not found' }, { status: 404 });
  const { rows } = await pool.query(
    `select j.id, j.output_asset_id, j.poster_asset_id, j.aspect, m.label as model_label,
            case when exists (select 1 from assets a, assets b where a.id = any(j.input_asset_ids) and b.id = any($3::text[]) and (a.id = b.id or a.sha256 = b.sha256)) then 'inputs'
                 when $4::text is not null and ${OWN_PROMPT} = $4 then 'prompt' end as match
       from examples e
       join jobs j on j.id = e.job_id
       join model_configs m on m.id = j.model
      where ${LIVE_CLIP} and j.feature = $2 and j.id <> $1
      order by 6 nulls last, e.created_at desc`,
    [id, job.feature, job.input_asset_ids, job.prompt],
  );
  return Response.json({
    examples: rows.map((r) => ({ id: r.id, videoAssetId: r.output_asset_id, posterAssetId: r.poster_asset_id, ratio: r.aspect, modelLabel: r.model_label, match: r.match })),
  });
}

/**
 * Puts a result on its page's Examples tab (`PUT`) or takes it off (`DELETE`). Admin only, audited; a featured mark is only a suggestion and never does this.
 * Only a result of a page with such a tab (Image Generation, Try On, Marketing Studio) may go there. Repeating a call is harmless.
 */
export async function PUT(request: Request, ctx: RouteContext) {
  return set(request, ctx, true);
}

export async function DELETE(request: Request, ctx: RouteContext) {
  return set(request, ctx, false);
}

async function set(request: Request, { params }: RouteContext, on: boolean): Promise<Response> {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const job = (await tx.query(`select j.feature from jobs j where j.id = $1 and ${LIVE_CLIP} for update of j`, [id])).rows[0];
    if (!job) return Response.json({ error: 'not found' }, { status: 404 });
    if (on && !Object.hasOwn(GALLERY_SAMPLES, job.feature)) return Response.json({ error: 'only an Image Generation, Try On or Marketing Studio result can be an example' }, { status: 400 });
    const changed = on
      ? (await tx.query('insert into examples (job_id, added_by) values ($1, $2) on conflict do nothing', [id, userId])).rowCount
      : (await tx.query('delete from examples where job_id = $1', [id])).rowCount;
    if (changed) await audit(tx, { actorId: userId, action: on ? 'example.add' : 'example.remove', target: `job:${id}`, oldValue: { example: !on }, newValue: { example: on } });
    return Response.json({ example: on });
  });
}

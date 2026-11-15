import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { MAX_SHARED_TITLE, reaAnalyzeEnabled } from '@/lib/analyze';
import { readJson, type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Shares a finished analysis as a Smart Remake reference video for every member (`PUT { title }`, which renames one already shared and keeps its
 * place on the shelf) or takes it off the shelf (`DELETE`). Admin only, audited; a repeat that changes nothing writes no audit entry.
 */
export async function PUT(request: Request, ctx: RouteContext) {
  return set(request, ctx, true);
}

export async function DELETE(request: Request, ctx: RouteContext) {
  return set(request, ctx, false);
}

async function set(request: Request, { params }: RouteContext, on: boolean): Promise<Response> {
  if (!reaAnalyzeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  let title: string | null = null;
  if (on) {
    const b = (await readJson(request)) as { title?: unknown } | null;
    title = typeof b?.title === 'string' ? b.title.trim() : '';
    if (title.length < 1 || title.length > MAX_SHARED_TITLE) return Response.json({ error: `title must be 1 to ${MAX_SHARED_TITLE} characters` }, { status: 400 });
  }
  const { id } = await params;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const row = (
      await tx.query(
        `select status, shared_title as "sharedTitle", exists (select 1 from assets a where a.s3_key = analyses.source_key and a.deleted_at is null) as "hasSource"
           from analyses where id = $1 for update`,
        [id],
      )
    ).rows[0];
    if (!row) return Response.json({ error: 'not found' }, { status: 404 });
    if (on && row.status !== 'succeeded') return Response.json({ error: 'only a finished analysis can be shared' }, { status: 400 });
    if (on && !row.hasSource) return Response.json({ error: 'the analysis has no source video to share' }, { status: 400 });
    const saved = (
      await tx.query(
        `update analyses set shared_title = $2, shared_at = case when $2::text is null then null else coalesce(shared_at, now()) end where id = $1
         returning shared_title as "sharedTitle", shared_at as "sharedAt"`,
        [id, title],
      )
    ).rows[0];
    if (row.sharedTitle !== title) {
      await audit(tx, { actorId: g.session.user.id, action: on ? 'analysis.share' : 'analysis.unshare', target: `analysis:${id}`, oldValue: { sharedTitle: row.sharedTitle }, newValue: { sharedTitle: title } });
    }
    return Response.json(saved);
  });
}

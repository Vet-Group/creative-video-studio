import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { LIVE_CLIP } from '@/lib/clips';
import { isFault } from '@/lib/faults';
import { guard } from '@/lib/session';

const bad = (error: string) => Response.json({ error }, { status: 400 });

/**
 * Marks a Library clip Pass or Fail (`{ verdict: 'pass' }` or `{ verdict: 'fail', fault }`, the fault being one of the PRD faults or `other`).
 * Only the creator or an Admin may; every write, first mark or change, is audited with the old and new verdict.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { verdict?: unknown; fault?: unknown } | null;
  const verdict = body?.verdict;
  if (verdict !== 'pass' && verdict !== 'fail') return bad("verdict must be 'pass' or 'fail'");
  if (verdict === 'fail' && !isFault(body?.fault)) return bad('a Fail needs one of the faults, or other');
  const fault = verdict === 'fail' ? (body!.fault as string) : null;
  const { id: userId, role } = g.session.user;

  return withTransaction(pool, async (tx): Promise<Response> => {
    // The job row is locked, so two edits of one clip are audited one after the other.
    const job = (await tx.query(`select j.user_id, j.output_asset_id from jobs j where j.id = $1 and ${LIVE_CLIP} for update of j`, [id])).rows[0];
    if (!job) return Response.json({ error: 'not found' }, { status: 404 });
    if (job.user_id !== userId && role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });
    const old = (await tx.query('select verdict, fault, marked_by from verdicts where job_id = $1', [id])).rows[0];
    await tx.query(
      `insert into verdicts (id, job_id, output_asset_id, verdict, fault, marked_by) values ($1, $2, $3, $4, $5, $6)
       on conflict (job_id) do update set verdict = excluded.verdict, fault = excluded.fault, marked_by = excluded.marked_by, updated_at = now()`,
      [crypto.randomUUID(), id, job.output_asset_id, verdict, fault, userId],
    );
    await audit(tx, {
      actorId: userId,
      action: 'verdict.set',
      target: `job:${id}`,
      oldValue: old ? { verdict: old.verdict, fault: old.fault, markedBy: old.marked_by } : null,
      newValue: { verdict, fault, markedBy: userId },
    });
    return Response.json({ verdict: { verdict, fault, markedBy: userId } });
  });
}

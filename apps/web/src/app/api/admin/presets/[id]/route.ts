import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, nonEmpty, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Admin: edit a preset's `label`, `prompt` and `sortOrder`, or switch it on or off with `enabled`. The old and new values of what changed are audited as preset.update. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const body = (await readBody(request)) ?? {};
  const { label, prompt, sortOrder, enabled } = body;
  if ((label !== undefined && !nonEmpty(label)) || (prompt !== undefined && !nonEmpty(prompt)) || (enabled !== undefined && typeof enabled !== 'boolean')) {
    return bad('label and prompt must be non-empty, enabled true or false');
  }
  if (sortOrder !== undefined && !(Number.isInteger(sortOrder) && Math.abs(sortOrder as number) <= 1_000_000)) return bad('sortOrder must be a whole number');
  if ([label, prompt, sortOrder, enabled].every((v) => v === undefined)) return bad('give at least one of label, prompt, sortOrder, enabled');

  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query('select label, prompt, sort_order as "sortOrder", enabled from presets where id = $1 for update', [id])).rows[0];
    if (!old) return bad('not found', 404);
    const next = { ...old, ...Object.fromEntries(Object.entries({ label, prompt, sortOrder, enabled }).filter(([, v]) => v !== undefined)) };
    const changed = Object.keys(old).filter((k) => next[k] !== old[k]);
    if (changed.length > 0) {
      await tx.query('update presets set label = $2, prompt = $3, sort_order = $4, enabled = $5, updated_at = now() where id = $1', [id, next.label, next.prompt, next.sortOrder, next.enabled]);
      await audit(tx, {
        actorId: g.session.user.id, action: 'preset.update', target: `preset:${id}`,
        oldValue: Object.fromEntries(changed.map((k) => [k, old[k]])), newValue: Object.fromEntries(changed.map((k) => [k, next[k]])),
      });
    }
    return Response.json({ id, ...next });
  });
}

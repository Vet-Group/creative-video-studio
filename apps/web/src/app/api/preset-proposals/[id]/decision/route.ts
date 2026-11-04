import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { createPreset, updatePreset } from '@/lib/presets';
import { guard } from '@/lib/session';

/**
 * Admin or template editor: `{approve: true}` applies a pending proposal (as POST /api/presets or PATCH /api/presets/[id] would, with their audit
 * rows, the proposal's values over whatever the preset holds now) and marks it approved; `{approve: false}` rejects it. One decision is enough,
 * and a decided proposal is never decided again (409). Audited as preset_proposal.approve or preset_proposal.reject, in the same transaction.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'editor');
  if (g.error) return g.error;
  const { id } = await params;
  const { approve } = (await readBody(request)) ?? {};
  if (typeof approve !== 'boolean') return bad('approve must be true or false');
  const actorId = g.session.user.id;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const p = (await tx.query('select preset_id, label, prompt, enabled, sort_order, proposed_by, status from preset_proposals where id = $1 for update', [id])).rows[0];
    if (!p) return bad('not found', 404);
    if (p.status !== 'pending') return bad(`the proposal is already ${p.status}`, 409);
    const fields = Object.fromEntries(Object.entries({ label: p.label, prompt: p.prompt, enabled: p.enabled, sortOrder: p.sort_order }).filter(([, v]) => v !== null));
    // The preset cannot be gone: presets are never deleted and the proposal's key restricts it.
    const preset = !approve ? null : p.preset_id === null ? await createPreset(tx, actorId, { ...fields, label: p.label, prompt: p.prompt }) : await updatePreset(tx, actorId, p.preset_id, fields);
    const status = approve ? 'approved' : 'rejected';
    await tx.query('update preset_proposals set status = $2, decided_by = $3, decided_at = now() where id = $1', [id, status, actorId]);
    await audit(tx, {
      actorId, action: approve ? 'preset_proposal.approve' : 'preset_proposal.reject', target: `preset_proposal:${id}`,
      oldValue: { status: 'pending' }, newValue: { status, proposedBy: p.proposed_by, presetId: preset?.id ?? p.preset_id },
    });
    return Response.json({ id, status, preset });
  });
}

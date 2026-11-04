import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { createPreset, presetFields } from '@/lib/presets';
import { guard, isEditor } from '@/lib/session';

/**
 * The preset picker: the enabled presets in display order, by id and label, and `canEdit` for a template editor (lib/session.ts), who also gets
 * the switched-off presets and each one's prompt, order and state. A member's prompt stays on the server, where Run reads it.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const canEdit = isEditor(g.session.user);
  const { rows } = await pool.query(
    canEdit
      ? 'select id, label, prompt, enabled, sort_order as "sortOrder" from presets order by sort_order, id'
      : 'select id, label from presets where enabled order by sort_order, id',
  );
  return Response.json({ presets: rows, canEdit });
}

/** Template editor: add a preset (`label` and `prompt`, optional `sortOrder` and `enabled`), audited as preset.create. Its id comes from the label. */
export async function POST(request: Request) {
  const g = await guard(request, 'editor');
  if (g.error) return g.error;
  const fields = presetFields((await readBody(request)) ?? {});
  if (typeof fields === 'string') return bad(fields);
  const { label, prompt } = fields;
  if (label === undefined || prompt === undefined) return bad('label and prompt are required');
  const preset = await withTransaction(pool, (tx) => createPreset(tx, g.session.user.id, { ...fields, label, prompt }));
  return Response.json(preset, { status: 201 });
}

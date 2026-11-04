import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { createPreset, presetFeature, presetFields } from '@/lib/presets';
import { guard, isEditor } from '@/lib/session';

/**
 * The preset picker of `?feature=` (`video`, Create's motion presets, when left out; `image`, Image Generation's styles): the enabled presets in display
 * order, by id and label, and `canEdit` for a template editor (lib/session.ts), who also gets the switched-off presets and each one's prompt, order
 * and state. A member's prompt stays on the server, where Run reads it.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const feature = presetFeature(new URL(request.url).searchParams.get('feature'));
  if (!feature) return bad('feature must be video or image');
  const canEdit = isEditor(g.session.user);
  const { rows } = await pool.query(
    canEdit
      ? 'select id, label, prompt, enabled, sort_order as "sortOrder" from presets where feature = $1 order by sort_order, id'
      : 'select id, label from presets where feature = $1 and enabled order by sort_order, id',
    [feature],
  );
  return Response.json({ presets: rows, canEdit });
}

/** Template editor: add a preset (`label` and `prompt`, optional `sortOrder`, `enabled` and `feature`, default `video`), audited as preset.create. Its id comes from the label. */
export async function POST(request: Request) {
  const g = await guard(request, 'editor');
  if (g.error) return g.error;
  const body = (await readBody(request)) ?? {};
  const fields = presetFields(body);
  if (typeof fields === 'string') return bad(fields);
  const feature = presetFeature(body.feature);
  if (!feature) return bad('feature must be video or image');
  const { label, prompt } = fields;
  if (label === undefined || prompt === undefined) return bad('label and prompt are required');
  const preset = await withTransaction(pool, (tx) => createPreset(tx, g.session.user.id, { ...fields, label, prompt }, feature));
  return Response.json(preset, { status: 201 });
}

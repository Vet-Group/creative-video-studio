import { withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { bad, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { MIN_USES, weeklyUses } from '@/lib/popular';
import { BAD_GROUP, createPreset, presetFeature, presetFields, presetGroup } from '@/lib/presets';
import { guard, isEditor } from '@/lib/session';

/**
 * The preset picker of `?feature=` (`video`, Create's motion presets, when left out; `image`, Image Generation's styles): the enabled presets in display
 * order, by id, label and `group` (the picker section), and `canEdit` for a template editor (lib/session.ts), who also gets the switched-off presets
 * and each one's prompt, order and state. A member's prompt stays on the server, where Run reads it. `canPropose`: proposals to the shared catalog are the
 * company workspace's only (/api/preset-proposals refuses them elsewhere), so a partner's picker offers none. A preset the caller's workspace Ran at least MIN_USES times
 * in the last 7 days also carries `uses` (lib/popular.ts), for the picker's weekly-use line.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const feature = presetFeature(new URL(request.url).searchParams.get('feature'));
  if (!feature) return bad('feature must be video or image');
  const canEdit = isEditor(g.session.user, g.workspaceId);
  const { rows } = await pool.query(
    canEdit
      ? 'select id, label, prompt, enabled, sort_order as "sortOrder", "group" from presets where feature = $1 order by sort_order, id'
      : 'select id, label, "group" from presets where feature = $1 and enabled order by sort_order, id',
    [feature],
  );
  const { presets: uses } = await weeklyUses(pool, g.workspaceId);
  const presets = rows.map((r) => ((uses.get(r.id) ?? 0) >= MIN_USES ? { ...r, uses: uses.get(r.id) } : r));
  return Response.json({ presets, canEdit, canPropose: g.workspaceId === COMPANY_WORKSPACE_ID });
}

/** Template editor: add a preset (`label` and `prompt`, optional `sortOrder`, `enabled`, `feature`, default `video`, and `group`, default `product`), audited as preset.create. Its id comes from the label. */
export async function POST(request: Request) {
  const g = await guard(request, 'editor');
  if (g.error) return g.error;
  const body = (await readBody(request)) ?? {};
  const fields = presetFields(body);
  if (typeof fields === 'string') return bad(fields);
  const feature = presetFeature(body.feature);
  if (!feature) return bad('feature must be video or image');
  const group = body.group === undefined ? 'product' : presetGroup(body.group);
  if (!group) return bad(BAD_GROUP);
  const { label, prompt } = fields;
  if (label === undefined || prompt === undefined) return bad('label and prompt are required');
  const preset = await withTransaction(pool, (tx) => createPreset(tx, g.session.user.id, { ...fields, label, prompt, group }, feature));
  return Response.json(preset, { status: 201 });
}

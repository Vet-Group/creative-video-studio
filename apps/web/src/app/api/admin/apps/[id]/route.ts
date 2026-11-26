import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { promptLimit } from '@cvs/core/models';
import { bad, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { type AppInputBody, appInputProblem, cleanApp } from '@/lib/custom-apps';
import { guard } from '@/lib/session';
import { fixedInputs, onlyKeys, parseInputs } from '../fields';

const CONTENT = ['name', 'description', 'category', 'prompt', 'inputs'] as const;

/**
 * Admin: change an app of the active workspace, any of `{ name, description, category, prompt, inputs, published }` (`inputs` as POST /api/admin/apps reads them, mapped against the
 * clip the app was made from; `published` true or false puts it on the Apps page or takes it off). The fields are checked as a whole when one of them is sent (appInputProblem), and
 * the model, ratio and duration stay the clip's. 404 for another workspace's id. Audited `app.update`, `app.publish` and `app.unpublish`.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const b = await readBody(request);
  const inputs = b?.inputs === undefined ? undefined : parseInputs(b.inputs);
  if (
    !b || Object.keys(b).length === 0 || !onlyKeys(b, [...CONTENT, 'published']) || (b.inputs !== undefined && !inputs) || (b.published !== undefined && typeof b.published !== 'boolean') ||
    ['name', 'description', 'category', 'prompt'].some((k) => b[k] !== undefined && typeof b[k] !== 'string')
  ) {
    return bad('give at least one of name, description, category, prompt (text), inputs ([{ slot: { label, hint } } or { fixed: true }] for each input of the clip) and published (true or false)');
  }
  const actorId = g.session.user.id;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const app = (
      await tx.query(
        `select a.name, a.description, a.category, a.prompt, a.inputs, a.published_at is not null as published, j.input_asset_ids,
                (select m.max_prompt_chars from model_configs m where m.id = a.model) as max_prompt_chars
           from custom_apps a join jobs j on j.id = a.source_job_id where a.id = $1 and a.workspace_id = $2 for update of a`,
        [id, g.workspaceId],
      )
    ).rows[0];
    if (!app) return bad('not found', 404);
    const changed = CONTENT.filter((k) => b[k] !== undefined);
    const next = cleanApp({
      name: (b.name as string | undefined) ?? app.name,
      description: (b.description as string | undefined) ?? app.description,
      category: (b.category as string | undefined) ?? app.category,
      prompt: (b.prompt as string | undefined) ?? app.prompt,
      inputs: inputs ?? (app.inputs as AppInputBody[]),
    });
    if (changed.length > 0) {
      const problem = appInputProblem(next, app.input_asset_ids.length, promptLimit(app.max_prompt_chars));
      if (problem) return bad(problem);
    }
    const stored = inputs ? fixedInputs(next.inputs, app.input_asset_ids) : app.inputs;
    const published: boolean = b.published ?? app.published;
    await tx.query(
      `update custom_apps set name = $2, description = $3, category = $4, prompt = $5, inputs = $6::jsonb,
              published_at = case when $7::boolean then coalesce(published_at, now()) end, updated_at = now() where id = $1`,
      [id, next.name, next.description, next.category, next.prompt, JSON.stringify(stored), published],
    );
    if (changed.length > 0) {
      await audit(tx, {
        actorId,
        action: 'app.update',
        target: `app:${id}`,
        oldValue: Object.fromEntries(changed.map((k) => [k, app[k]])),
        newValue: Object.fromEntries(changed.map((k) => [k, k === 'inputs' ? stored : next[k]])),
      });
    }
    if (published !== app.published) await audit(tx, { actorId, action: published ? 'app.publish' : 'app.unpublish', target: `app:${id}`, newValue: { name: next.name } });
    return Response.json({ id, published });
  });
}

/** Admin: delete an app of the active workspace (nothing points at it, and its clip can be deleted again). 404 for another workspace's id. Audited `app.delete`. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const app = (await tx.query('delete from custom_apps where id = $1 and workspace_id = $2 returning name, source_job_id', [id, g.workspaceId])).rows[0];
    if (!app) return bad('not found', 404);
    await audit(tx, { actorId: g.session.user.id, action: 'app.delete', target: `app:${id}`, oldValue: { name: app.name, jobId: app.source_job_id } });
    return Response.json({ id, deleted: true });
  });
}

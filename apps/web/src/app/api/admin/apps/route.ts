import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { appInputProblem, cleanApp } from '@/lib/custom-apps';
import { appSource } from '@/lib/custom-apps-db';
import { guard } from '@/lib/session';
import { fixedInputs, LOST_FIXED, lostFixed, onlyKeys, parseInputs } from './fields';

/**
 * Admin: make an app of a live clip of the active workspace, `{ jobId, name, description?, category, prompt, inputs, publish? }`: `inputs` has one `{ slot: { label, hint } }` (the
 * member uploads it) or `{ fixed: true }` (the clip's own photo stays) for each input of the clip. The feature, ratio, duration and the clip's sound or resolution are copied from
 * the clip, the model is the cheaper row of its pair, and a draft stays Admin-only until `publish`. 201 `{ id }`; 404 for a clip that is not live here; 400 with a Vietnamese reason
 * for a clip that cannot become an app (lib/custom-apps.ts draftFromJob) or fields that do not hold (appInputProblem). Audited `app.create` and `app.publish`.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const b = await readBody(request);
  const inputs = parseInputs(b?.inputs);
  if (
    !b || !onlyKeys(b, ['jobId', 'name', 'description', 'category', 'prompt', 'inputs', 'publish']) || typeof b.jobId !== 'string' || !inputs ||
    [b.name, b.category, b.prompt].some((v) => typeof v !== 'string') || (b.description !== undefined && typeof b.description !== 'string') || (b.publish !== undefined && typeof b.publish !== 'boolean')
  ) {
    return bad('jobId, name, category, prompt and inputs ([{ slot: { label, hint } } or { fixed: true }] for each input of the clip) are required; description and publish are optional');
  }
  const fields = cleanApp({ name: b.name as string, description: (b.description as string | undefined) ?? '', category: b.category as string, prompt: b.prompt as string, inputs });
  const actorId = g.session.user.id;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const source = await appSource(tx, b.jobId as string, g.workspaceId, true);
    if (!source) return bad('not found', 404);
    if (typeof source.draft === 'string') return bad(source.draft);
    const problem = appInputProblem(fields, source.inputIds.length, source.maxPromptChars);
    if (problem) return bad(problem);
    if (lostFixed(fields.inputs, source.inputIds, new Set(source.images.map((i) => i.id)))) return bad(LOST_FIXED);
    const id = crypto.randomUUID();
    const { draft } = source;
    await tx.query(
      `insert into custom_apps (id, workspace_id, source_job_id, feature, name, description, category, model, prompt, aspect, duration_s, params, inputs, created_by, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, case when $15::boolean then now() end)`,
      [id, g.workspaceId, b.jobId, draft.feature, fields.name, fields.description, fields.category, source.pairModel, fields.prompt, draft.aspect, draft.durationS, JSON.stringify(draft.params), JSON.stringify(fixedInputs(fields.inputs, source.inputIds)), actorId, b.publish === true],
    );
    await audit(tx, { actorId, action: 'app.create', target: `app:${id}`, newValue: { jobId: b.jobId, name: fields.name, category: fields.category } });
    if (b.publish === true) await audit(tx, { actorId, action: 'app.publish', target: `app:${id}`, newValue: { name: fields.name } });
    return Response.json({ id }, { status: 201 });
  });
}

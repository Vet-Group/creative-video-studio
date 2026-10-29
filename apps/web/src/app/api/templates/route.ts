import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/auth';
import { findChoice } from '@/lib/choices';
import { canReuse } from '@/lib/reuse';
import { guard } from '@/lib/session';
import { MAX_TEMPLATE_NAME, MAX_TEMPLATES, templateData } from '@/lib/templates';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** `?feature=`: the caller's own templates of that page, then the company's (an Admin shared them), newest first in each; `canShare` for an Admin. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const feature = new URL(request.url).searchParams.get('feature') ?? '';
  if (!canReuse(feature)) return bad('feature must be a page that takes templates');
  const { rows } = await pool.query(
    `select id, name, is_company, user_id = $1 as mine from user_templates where feature = $2 and (user_id = $1 or is_company)
      order by (user_id = $1) desc, created_at desc`,
    [g.session.user.id, feature],
  );
  return Response.json({ templates: rows.map((r) => ({ id: r.id, name: r.name, isCompany: r.is_company, mine: r.mine })), canShare: g.session.user.role === 'admin' });
}

/** What a job of the caller gives a template (`fromJob`), in the shape GET /api/jobs/:id exposes it; null when it is not the caller's live job. */
async function jobData(jobId: string, userId: string): Promise<{ feature: string; data: Record<string, unknown> } | null> {
  const j = (
    await pool.query(
      `select j.feature, j.params, j.preset_id, j.prompt, j.enhance, j.aspect, j.duration_s, j.model,
              (select array_agg(a.id order by array_position(j.input_asset_ids, a.id)) from assets a
                where a.id = any(j.input_asset_ids) and a.owner_id = $2 and a.kind = 'input' and a.deleted_at is null) as images,
              (select s.id from stores s where s.id = j.store_id and not s.hidden) as store_id
         from jobs j where j.id = $1 and j.user_id = $2 and j.deleted_at is null and j.purged_at is null`,
      [jobId, userId],
    )
  ).rows[0];
  if (!j) return null;
  const p = j.params as Record<string, string>;
  // The member's own prompt: a free prompt on Create video, Image Generation and Motion Control; elsewhere the prompt is composed, so the kept brief.
  const ownPrompt = (j.feature === 'video' && !j.preset_id) || j.feature === 'image' || j.feature === 'motion_control';
  const data = {
    images: j.images ?? [],
    prompt: ownPrompt ? j.prompt : undefined,
    brief: p.brief, script: p.script, hook: p.hook, location: p.location, format: p.format, audio: p.audio,
    garments: p.garments ? Number(p.garments) : undefined,
    enhance: ['video', 'image'].includes(j.feature) ? j.enhance : undefined,
    ratio: j.aspect, resolution: p.resolution, modelId: j.model, presetId: j.preset_id, storeId: j.store_id,
    durationSec: ['video', 'marketing'].includes(j.feature) ? j.duration_s : undefined,
  };
  return { feature: j.feature, data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
}

/**
 * Saves the caller's form as a template: `feature` (a page that refills), `name` (1 to 60 characters), `data` (lib/templates.ts) whose images must be
 * the caller's own live uploads, and `isCompany` (Admin only) to share it. A member keeps at most 50. The hook and the location must be ones the caller
 * may use (lib/choices.ts), and a company template may hold only built-in or company ones.
 * `fromJob` (instead of `feature` and `data`) saves what one of the caller's own jobs was made from, as a History card's Save template does: its own live uploads,
 * its words and its settings; a hook or location the caller can no longer use is left out.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { feature?: unknown; name?: unknown; data?: unknown; isCompany?: unknown; fromJob?: unknown } | null;
  const fromJob = body?.fromJob;
  if (fromJob !== undefined && (typeof fromJob !== 'string' || body?.feature !== undefined || body?.data !== undefined)) return bad('fromJob is a job id, given without feature and data');
  if (fromJob === undefined && !canReuse(typeof body?.feature === 'string' ? body.feature : '')) return bad('feature must be a page that takes templates');
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > MAX_TEMPLATE_NAME) return bad(`name must have 1 to ${MAX_TEMPLATE_NAME} characters`);
  if (body?.isCompany !== undefined && typeof body.isCompany !== 'boolean') return bad('isCompany must be true or false');
  const isCompany = body?.isCompany === true;
  if (isCompany && g.session.user.role !== 'admin') return bad('only an Admin shares a template with the company', 403);
  const userId = g.session.user.id;
  const job = typeof fromJob === 'string' ? await jobData(fromJob, userId) : null;
  if (typeof fromJob === 'string' && !job) return bad('the job does not exist', 404);
  const feature = job ? job.feature : (body?.feature as string);
  if (!canReuse(feature)) return bad('the job is of a page that takes no templates');
  const data = templateData(job ? job.data : body?.data);
  if (typeof data === 'string') return bad(data);
  for (const key of ['hook', 'location'] as const) {
    if (data[key] === undefined) continue;
    const choice = await findChoice(userId, key, data[key]);
    if (!choice && job) delete data[key]; // a choice deleted since the job ran
    else if (!choice) return bad(`data.${key} is not a ${key}`);
    else if (isCompany && !choice.builtIn && !choice.isCompany) return bad('a company template may use only built-in or company hooks and locations');
  }
  if (data.images.length > 0) {
    const own = await pool.query(`select count(*)::int as n from assets where id = any($1::text[]) and owner_id = $2 and kind = 'input' and deleted_at is null`, [data.images, userId]);
    if (own.rows[0].n !== data.images.length) return bad('data.images may hold only your own uploads');
  }
  const id = randomUUID();
  // One writer per member, so two saves cannot both take the 50th place.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('templates:' || $1))`, [userId]);
    const count = (await client.query('select count(*)::int as n from user_templates where user_id = $1', [userId])).rows[0].n;
    if (count >= MAX_TEMPLATES) {
      await client.query('rollback');
      return bad(`you can keep at most ${MAX_TEMPLATES} templates; delete one first`, 409);
    }
    await client.query('insert into user_templates (id, user_id, feature, name, data, is_company) values ($1, $2, $3, $4, $5, $6)', [id, userId, feature, name, JSON.stringify(data), isCompany]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return Response.json({ id, name, isCompany }, { status: 201 });
}

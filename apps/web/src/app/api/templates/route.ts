import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/auth';
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

/**
 * Saves the caller's form as a template: `feature` (a page that refills), `name` (1 to 60 characters), `data` (lib/templates.ts) whose images must be
 * the caller's own live uploads, and `isCompany` (Admin only) to share it. A member keeps at most 50.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { feature?: unknown; name?: unknown; data?: unknown; isCompany?: unknown } | null;
  const feature = typeof body?.feature === 'string' ? body.feature : '';
  if (!canReuse(feature)) return bad('feature must be a page that takes templates');
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > MAX_TEMPLATE_NAME) return bad(`name must have 1 to ${MAX_TEMPLATE_NAME} characters`);
  const data = templateData(body?.data);
  if (typeof data === 'string') return bad(data);
  if (body?.isCompany !== undefined && typeof body.isCompany !== 'boolean') return bad('isCompany must be true or false');
  const isCompany = body?.isCompany === true;
  if (isCompany && g.session.user.role !== 'admin') return bad('only an Admin shares a template with the company', 403);
  const userId = g.session.user.id;
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

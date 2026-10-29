import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';
import type { TemplateData } from '@/lib/templates';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * A template in the shape the pages refill from (as GET /api/jobs/:id): to its owner, or to anyone when the company shares it. The images are
 * re-checked here: only the viewer's own live uploads come back, so a shared template never hands out the Admin's photos.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  const t = (await pool.query('select id, feature, name, data, is_company from user_templates where id = $1 and (user_id = $2 or is_company)', [id, userId])).rows[0];
  if (!t) return notFound();
  const data = t.data as TemplateData;
  const images = await pool.query(
    `select id, filename, mime, duration_ms as "durationMs" from assets where id = any($1::text[]) and owner_id = $2 and kind = 'input' and deleted_at is null order by array_position($1::text[], id)`,
    [data.images, userId],
  );
  return Response.json({
    id: t.id, name: t.name, isCompany: t.is_company, feature: t.feature, images: images.rows,
    prompt: data.prompt ?? null, brief: data.brief ?? null, script: data.script ?? null, hook: data.hook ?? null, location: data.location ?? null,
    format: data.format ?? null, audio: data.audio ?? null, enhance: data.enhance ?? null, garments: data.garments ?? null, durationSec: data.durationSec ?? null,
    ratio: data.ratio ?? null, resolution: data.resolution ?? null, modelId: data.modelId ?? null, presetId: data.presetId ?? null, storeId: data.storeId ?? null,
  });
}

/** Deletes the caller's own template; an Admin may also delete a company one. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const admin = g.session.user.role === 'admin';
  const res = await pool.query('delete from user_templates where id = $1 and (user_id = $2 or ($3 and is_company))', [id, g.session.user.id, admin]);
  return res.rowCount ? new Response(null, { status: 204 }) : notFound();
}

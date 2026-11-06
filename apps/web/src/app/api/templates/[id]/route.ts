import { createHash } from 'node:crypto';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard, isEditor } from '@/lib/session';
import { copyObject } from '@/lib/storage';
import type { TemplateData } from '@/lib/templates';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * The viewer's own copy of each of the author's live uploads among `ids` (the source id to the copy's id), copied on the server the first time. A copy, not
 * a shared row: an object belongs to one asset (s3_key is unique) and the purge removes an input's object with its last job, so the author's clean-up never
 * takes the viewer's copy, and every check that an input is the caller's own stays as it is. The copy's id comes from the source and the viewer, so applying
 * the template again reuses it; one that fails to copy is left out, as a deleted upload is.
 */
async function copiesOf(ids: string[], authorId: string, viewerId: string): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await pool.query(`select id, s3_key from assets where id = any($1::text[]) and owner_id = $2 and kind = 'input' and deleted_at is null`, [ids, authorId]);
  const copyId = (id: string) => createHash('sha256').update(`template-copy:${id}:${viewerId}`).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5');
  const made = new Set((await pool.query('select id from assets where id = any($1::text[])', [rows.map((r) => copyId(r.id))])).rows.map((r) => r.id as string));
  await Promise.allSettled(
    rows
      .filter((r) => !made.has(copyId(r.id)))
      .map(async (r) => {
        const id = copyId(r.id);
        await copyObject(r.s3_key, `assets/${id}`);
        await pool.query(
          `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms)
             select $1, $2, kind, $3, filename, mime, bytes, duration_ms from assets where id = $4 on conflict (id) do nothing`,
          [id, viewerId, `assets/${id}`, r.id],
        );
      }),
  );
  return new Map(rows.map((r) => [r.id as string, copyId(r.id)]));
}

/**
 * A template in the shape the pages refill from (as GET /api/jobs/:id): to its owner, or to anyone when the company or a store shares it (stores have no
 * members). The images, end frame and audio clips are re-checked here: its owner gets their own live uploads back; anyone else gets their own copies of the
 * author's live uploads the template names (copiesOf), so a shared template hands out its photos and clips, and nothing else of the author's.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  const t = (await pool.query('select id, user_id, feature, name, data, is_company from user_templates where id = $1 and (user_id = $2 or is_company or store_id is not null)', [id, userId])).rows[0];
  if (!t) return notFound();
  const data = t.data as TemplateData;
  const copies = t.user_id === userId ? null : await copiesOf([...data.images, ...(data.endFrame ? [data.endFrame] : []), ...(data.videoRef ? [data.videoRef] : []), ...(data.clips ?? [])], t.user_id, userId);
  const own = async (ids: string[]) =>
    (
      await pool.query(
        `select id, filename, mime, duration_ms as "durationMs" from assets where id = any($1::text[]) and owner_id = $2 and kind = 'input' and deleted_at is null order by array_position($1::text[], id)`,
        [copies ? ids.flatMap((i) => copies.get(i) ?? []) : ids, userId],
      )
    ).rows;
  const [images, endFrame, videoRef, clips] = await Promise.all([own(data.images), own(data.endFrame ? [data.endFrame] : []), own(data.videoRef ? [data.videoRef] : []), own(data.clips ?? [])]);
  return Response.json({
    id: t.id, name: t.name, isCompany: t.is_company, feature: t.feature, images, endFrame: endFrame[0] ?? null, videoRef: videoRef[0] ?? null, clips,
    prompt: data.prompt ?? null, brief: data.brief ?? null, script: data.script ?? null, hookText: data.hookText ?? null, ending: data.ending ?? null, endText: data.endText ?? null, endTextPos: data.endTextPos ?? null,
    hook: data.hook ?? null, location: data.location ?? null,
    format: data.format ?? null, promptMode: data.promptMode ?? null, audio: data.audio ?? null, enhance: data.enhance ?? null, garments: data.garments ?? null, durationSec: data.durationSec ?? null,
    ratio: data.ratio ?? null, resolution: data.resolution ?? null, modelId: data.modelId ?? null, presetId: data.presetId ?? null, storeId: data.storeId ?? null,
  });
}

/** Deletes the caller's own template; an Admin or a template editor may also delete a company or a store one (403 for others). */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const res = await pool.query('delete from user_templates where id = $1 and (user_id = $2 or ($3 and (is_company or store_id is not null)))', [id, g.session.user.id, isEditor(g.session.user)]);
  if (res.rowCount) return new Response(null, { status: 204 });
  // A shared template the caller sees but may not delete.
  return (await pool.query('select 1 from user_templates where id = $1 and (is_company or store_id is not null)', [id])).rowCount ? Response.json({ error: 'forbidden' }, { status: 403 }) : notFound();
}

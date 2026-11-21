import sharp from 'sharp';
import { pool } from '@/lib/auth';
import { bytesOf, MAX_PIXELS, readJson } from '@/lib/assets';
import { LIBRARY_LISTED, LIVE_CLIP } from '@/lib/clips';
import { guard } from '@/lib/session';
import { getObject } from '@/lib/storage';

const CELL = 1024; // a picture's width; every cell takes the first picture's shape
const GAP = 24;
const bad = (error: string) => Response.json({ error }, { status: 400 });

/**
 * `{ ids }`: 2 to 4 distinct job ids of picture results the caller can list (the zip's rule: deleted, failed, unknown ids and another workspace's refuse with 403).
 * Answers with one JPEG on white, two pictures per row in the order given (an odd last one centred), each fitted whole into a cell of the first picture's shape: a lookbook of a pose Run.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const ids = ((await readJson(request)) as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4 || !ids.every((id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id))) return bad('ids must list 2 to 4 job ids');
  if (new Set(ids).size !== ids.length) return bad('ids must not repeat');
  const me = g.session.user;
  const { rows } = await pool.query<{ id: string; s3_key: string; mime: string }>(
    `select j.id, o.s3_key, o.mime from jobs j join assets o on o.id = j.output_asset_id
      where j.id = any($1::text[]) and j.workspace_id = $2 and ${LIVE_CLIP} and (${LIBRARY_LISTED} or j.user_id = $3 or $4::boolean) and o.deleted_at is null`,
    [ids, g.workspaceId, me.id, me.role === 'admin'],
  );
  if (rows.length !== ids.length) return Response.json({ error: 'one or more items cannot be used' }, { status: 403 });
  if (!rows.every((r) => r.mime.startsWith('image/'))) return bad('every item must be a picture');
  const byId = new Map(rows.map((r) => [r.id, r]));
  let pictures: Uint8Array[];
  try {
    pictures = await Promise.all(ids.map(async (id: string) => bytesOf(await getObject(byId.get(id)!.s3_key))));
  } catch (e) {
    if ((e as { name?: string }).name === 'NoSuchKey') return Response.json({ error: 'one or more items cannot be used' }, { status: 403 });
    throw e;
  }
  let cellHeight: number;
  const cells: Buffer[] = [];
  try {
    const { width = 1, height = 1, orientation = 1 } = await sharp(pictures[0], { limitInputPixels: MAX_PIXELS }).metadata();
    const [w, h] = orientation >= 5 ? [height, width] : [width, height]; // EXIF 5 to 8 turn the picture a quarter
    cellHeight = Math.round(CELL * Math.min(2, Math.max(0.5, h / w)));
    // One at a time: a large PNG decodes whole, and four at once would pass the web service's memory cap. Cells stay lossless until the one JPEG.
    for (const p of pictures) cells.push(await sharp(p, { limitInputPixels: MAX_PIXELS }).rotate().resize(CELL, cellHeight, { fit: 'contain', background: '#fff' }).flatten({ background: '#fff' }).png({ compressionLevel: 0 }).toBuffer());
  } catch {
    return Response.json({ error: 'a picture cannot be read' }, { status: 422 });
  }
  const sheet = sharp({ create: { width: GAP + 2 * (CELL + GAP), height: GAP + Math.ceil(cells.length / 2) * (cellHeight + GAP), channels: 3, background: '#fff' } });
  const lone = cells.length % 2 === 1 ? cells.length - 1 : -1;
  const placed = cells.map((input, i) => ({ input, left: GAP + (i === lone ? (CELL + GAP) / 2 : (i % 2) * (CELL + GAP)), top: GAP + Math.floor(i / 2) * (cellHeight + GAP) }));
  const body = new Uint8Array(await sheet.composite(placed).jpeg({ quality: 88 }).toBuffer());
  return new Response(body, {
    headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length), 'content-disposition': 'attachment; filename="lookbook.jpg"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}

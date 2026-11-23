import sharp from 'sharp';
import { pool } from '@/lib/auth';
import { bytesOf, MAX_PIXELS, readJson } from '@/lib/assets';
import { LIBRARY_LISTED, LIVE_CLIP } from '@/lib/clips';
import { guard } from '@/lib/session';
import { jpegPdf } from '@/lib/jpeg-pdf';
import { getObject } from '@/lib/storage';

const CELL = 1024; // a picture's width; every cell takes the first picture's shape
const GAP = 24;
const WIDTH = GAP + 2 * (CELL + GAP);
const HEADER = 260; // the PDF's title band above the grid
const TITLE_MAX = 60;
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const bad = (error: string) => Response.json({ error }, { status: 400 });

/**
 * `{ ids }`: 2 to 4 distinct job ids of picture results the caller can list (the zip's rule: deleted, failed, unknown ids and another workspace's refuse with 403).
 * Answers with one JPEG on white, two pictures per row in the order given (an odd last one centred), each fitted whole into a cell of the first picture's shape: a lookbook of a pose Run.
 * With `format: 'pdf'` it is one A4 page instead: the optional `title` (control characters, lone surrogates and noncharacters stripped, 60 characters at most; "Lookbook" when empty) and today's date above the same grid.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const input = (await readJson(request)) as { ids?: unknown; format?: unknown; title?: unknown } | null;
  const ids = input?.ids;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4 || !ids.every((id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id))) return bad('ids must list 2 to 4 job ids');
  if (new Set(ids).size !== ids.length) return bad('ids must not repeat');
  if (input?.format !== undefined && input.format !== 'jpg' && input.format !== 'pdf') return bad('format must be jpg or pdf');
  if (input?.title !== undefined && typeof input.title !== 'string') return bad('title must be text');
  const pdf = input?.format === 'pdf';
  const title = [...(typeof input?.title === 'string' ? input.title : '').replace(/[\p{Cc}\p{Cs}\p{Noncharacter_Code_Point}]/gu, '').trim()].slice(0, TITLE_MAX).join('').trim() || 'Lookbook';
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
  const top = pdf ? HEADER : 0;
  const height = top + GAP + Math.ceil(cells.length / 2) * (cellHeight + GAP);
  const sheet = sharp({ create: { width: WIDTH, height, channels: 3, background: '#fff' } });
  const lone = cells.length % 2 === 1 ? cells.length - 1 : -1;
  const placed = cells.map((input, i) => ({ input, left: GAP + (i === lone ? (CELL + GAP) / 2 : (i % 2) * (CELL + GAP)), top: top + GAP + Math.floor(i / 2) * (cellHeight + GAP) }));
  if (pdf) {
    // The title shrinks to stay inside the page's width, sized for its widest letter (W is about 1.04 em in DejaVu Sans Bold); DejaVu Sans, on the server, covers Vietnamese.
    const size = Math.min(84, Math.floor((WIDTH - 2 * GAP) / ([...title].length * 1.05)));
    const date = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEADER}" font-family="DejaVu Sans, Liberation Sans, sans-serif"><text x="${GAP}" y="120" font-size="${size}" font-weight="bold" fill="#111">${xml(title)}</text><text x="${GAP}" y="195" font-size="44" fill="#666">${xml(date)}</text></svg>`,
    );
    placed.push({ input: text, left: 0, top: 0 });
  }
  const jpeg = await sheet.composite(placed).jpeg({ quality: 88 }).toBuffer();
  const body = pdf ? jpegPdf(jpeg, WIDTH, height) : new Uint8Array(jpeg);
  return new Response(body, {
    headers: { 'content-type': pdf ? 'application/pdf' : 'image/jpeg', 'content-length': String(body.length), 'content-disposition': `attachment; filename="lookbook.${pdf ? 'pdf' : 'jpg'}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}

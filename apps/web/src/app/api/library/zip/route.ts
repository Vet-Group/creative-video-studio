import { pool } from '@/lib/auth';
import { downloadName, extensionOf, ICT_DAY, LIVE_CLIP } from '@/lib/clips';
import { signDownloadToken, verifyDownloadToken } from '@/lib/download-token';
import { guard } from '@/lib/session';
import { getObject } from '@/lib/storage';
import { ZIP32_LIMIT, zipStream } from '@/lib/zip';

const MAX_IDS = 50;
// An entry's headers (local, data descriptor, central) with a name of up to ~180 characters; 22 is the end record.
const ENTRY_OVERHEAD = 512;
// A worker-made filename's extension, or `bin`: no path separator reaches the zip entry name.
const safeExtension = (filename: string): string => (/^[a-z0-9]{1,5}$/i.test(extensionOf(filename)) ? extensionOf(filename) : 'bin');
const bad = (error: string) => Response.json({ error }, { status: 400 });

/** The Library items to zip, in the order given: 403 unless every id is a live clip (deleted, failed, purged and unknown ids refuse the whole request), 413 at 4 GiB or more. */
async function items(ids: string[]) {
  const { rows } = await pool.query(
    `select j.id, ${ICT_DAY} as day, u.name, o.s3_key, o.bytes, o.mime, o.filename
       from jobs j join users u on u.id = j.user_id join assets o on o.id = j.output_asset_id
      where j.id = any($1::text[]) and ${LIVE_CLIP} and o.deleted_at is null`,
    [ids],
  );
  if (rows.length !== ids.length) return { error: Response.json({ error: 'one or more items cannot be downloaded' }, { status: 403 }) };
  if (rows.reduce((sum, r) => sum + Number(r.bytes) + ENTRY_OVERHEAD, 22) >= ZIP32_LIMIT) return { error: Response.json({ error: 'the items add up to 4 GiB or more; pick fewer' }, { status: 413 }) };
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return { rows: ids.map((id) => byId.get(id)!) };
}

/** `{ ids }`: 1 to 50 distinct job ids of Library items. Answers with a download URL whose token is bound to the caller and the exact list, good for 5 minutes. */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_IDS) return bad(`ids must list 1 to ${MAX_IDS} items`);
  if (!ids.every((id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id))) return bad('each id must be a job id');
  if (new Set(ids).size !== ids.length) return bad('ids must not repeat');
  const found = await items(ids);
  if (found.error) return found.error;
  const list = ids.join(',');
  return Response.json({ downloadUrl: `/api/library/zip?ids=${list}&t=${signDownloadToken(`zip:${list}`, g.session.user.id)}` });
}

/** The zip itself, behind the token from POST; visibility is checked again. Entries are named as the Library names a download, with `-2` and so on on a clash. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const list = q.get('ids') ?? '';
  const token = q.get('t');
  if (!token || !verifyDownloadToken(token, `zip:${list}`, g.session.user.id)) return Response.json({ error: 'the download link is invalid or expired' }, { status: 403 });
  const found = await items(list.split(','));
  if (found.error) return found.error;
  const taken = new Set<string>();
  const entries = found.rows.map((r) => {
    const base = downloadName(r.day, r.name, r.id, r.mime.startsWith('image/') ? safeExtension(r.filename) : 'mp4');
    let name = base;
    for (let n = 2; taken.has(name); n++) name = base.replace(/(\.[^.]*)?$/, `-${n}$1`);
    taken.add(name);
    return { name, bytes: Number(r.bytes), open: () => getObject(r.s3_key) };
  });
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).replaceAll('-', '');
  return new Response(zipStream(entries), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="cvs-${day}-${entries.length}.zip"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

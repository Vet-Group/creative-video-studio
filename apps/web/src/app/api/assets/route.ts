import { insertAssets } from '@cvs/db/assets';
import { pool } from '@/lib/auth';
import { db, MAX_BYTES, MAX_FILENAME, MAX_FILES, MAX_VIDEO_BYTES, mp4DurationMs, readUploadForm, sniffImage, sniffVideo } from '@/lib/assets';
import { guard } from '@/lib/session';
import { deleteObject, putObject } from '@/lib/storage';

/** Cut a file name to MAX_FILENAME code points (never splitting a surrogate pair), keeping a short extension. */
function shortName(name: string): string {
  const chars = Array.from(name);
  if (chars.length <= MAX_FILENAME) return name;
  const dot = chars.lastIndexOf('.');
  const ext = dot > 0 && chars.length - dot <= 10 ? chars.slice(dot) : [];
  return [...chars.slice(0, MAX_FILENAME - ext.length), ...ext].join('');
}

/**
 * Upload 1-4 input files (multipart field `file`), all or nothing: JPEG/PNG/WebP images of at most 10 MB, or MP4/MOV videos (Motion Control's reference)
 * of at most 20 MB whose header gives their length (`durationMs`). The type comes from the magic bytes.
 */
/** The photo of a slot the caller used before, by `?recent=`: the feature and the input's place (1-based) in its jobs. */
const RECENT: Record<string, { feature: string; at: number }> = {
  'marketing-product': { feature: 'marketing', at: 2 },
  'try-on-model': { feature: 'try_on', at: 1 },
};

/**
 * `?recent=marketing-product`: the caller's own product photos from their UGC Marketing Studio jobs (the second input), for the product slot's My products
 * dialog (Fash's My Products); `?recent=try-on-model`: the model photos of their Try On jobs (the first input), for the model picker's My models. Newest use
 * first, each once, at most 12. Advanced references and deleted files are left out.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const key = new URL(request.url).searchParams.get('recent') ?? '';
  if (!Object.hasOwn(RECENT, key)) return Response.json({ error: `?recent= must be one of ${Object.keys(RECENT).join(', ')}` }, { status: 400 });
  const recent = RECENT[key]!;
  const { rows } = await pool.query(
    `select id, filename from (
       select distinct on (a.id) a.id, a.filename, j.created_at from jobs j join assets a on a.id = j.input_asset_ids[$2]
        where j.user_id = $1 and j.feature = $3 and coalesce(j.params->>'format', '') <> 'advanced' and j.deleted_at is null
          and a.owner_id = $1 and a.deleted_at is null
        order by a.id, j.created_at desc) p
     order by created_at desc limit 12`,
    [g.session.user.id, recent.at, recent.feature],
  );
  return Response.json({ assets: rows });
}

export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const form = await readUploadForm(request);
  if (form === 'too-large') return Response.json({ error: 'the upload is too large' }, { status: 413 });
  const files = (form?.getAll('file') ?? []).filter((f): f is File => typeof f !== 'string');
  if (files.length === 0 || files.length > MAX_FILES) {
    return Response.json({ error: `send 1 to ${MAX_FILES} files in the "file" field` }, { status: 400 });
  }
  const checked: { id: string; file: File; bytes: Uint8Array; mime: string; durationMs: number | null }[] = [];
  for (const file of files) {
    if (file.size > MAX_VIDEO_BYTES) return Response.json({ error: `${file.name} is larger than 20 MB` }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const video = sniffVideo(bytes);
    if (video) {
      const durationMs = mp4DurationMs(bytes);
      if (!durationMs) return Response.json({ error: `${file.name} has no readable length` }, { status: 415 });
      checked.push({ id: crypto.randomUUID(), file, bytes, mime: video, durationMs });
      continue;
    }
    if (file.size > MAX_BYTES) return Response.json({ error: `${file.name} is larger than 10 MB` }, { status: 413 });
    const mime = sniffImage(bytes);
    if (!mime) return Response.json({ error: `${file.name} is not a JPEG, PNG or WebP image, or an MP4 or MOV video` }, { status: 415 });
    checked.push({ id: crypto.randomUUID(), file, bytes, mime, durationMs: null });
  }
  const rows = checked.map(({ id, file, bytes, mime, durationMs }) => ({
    id,
    ownerId: g.session.user.id,
    kind: 'input' as const,
    s3Key: `assets/${id}`,
    filename: shortName(file.name || 'upload'),
    mime,
    bytes: bytes.length,
    durationMs,
  }));
  const puts = await Promise.allSettled(checked.map(({ id, bytes, mime }) => putObject(`assets/${id}`, bytes, mime)));
  try {
    const failed = puts.find((p): p is PromiseRejectedResult => p.status === 'rejected');
    if (failed) throw failed.reason;
    await insertAssets(db, rows);
  } catch (e) {
    // No row points at these objects, so remove them rather than leave orphans.
    await Promise.allSettled(rows.map((r) => deleteObject(r.s3Key)));
    throw e;
  }
  return Response.json({ assets: rows.map((r) => ({ id: r.id, filename: r.filename, mime: r.mime, bytes: r.bytes, durationMs: r.durationMs })) }, { status: 201 });
}

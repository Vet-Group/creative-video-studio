import { insertAssets } from '@cvs/db/assets';
import { db, MAX_BYTES, MAX_FILENAME, MAX_FILES, readUploadForm, sniffImage } from '@/lib/assets';
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

/** Upload 1-4 input images (multipart field `file`): at most 10 MB each, JPEG/PNG/WebP by magic bytes. All or nothing. */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const form = await readUploadForm(request);
  if (form === 'too-large') return Response.json({ error: 'the upload is too large' }, { status: 413 });
  const files = (form?.getAll('file') ?? []).filter((f): f is File => typeof f !== 'string');
  if (files.length === 0 || files.length > MAX_FILES) {
    return Response.json({ error: `send 1 to ${MAX_FILES} files in the "file" field` }, { status: 400 });
  }
  const checked: { id: string; file: File; bytes: Uint8Array; mime: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) return Response.json({ error: `${file.name} is larger than 10 MB` }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImage(bytes);
    if (!mime) return Response.json({ error: `${file.name} is not a JPEG, PNG or WebP image` }, { status: 415 });
    checked.push({ id: crypto.randomUUID(), file, bytes, mime });
  }
  const rows = checked.map(({ id, file, bytes, mime }) => ({
    id,
    ownerId: g.session.user.id,
    kind: 'input' as const,
    s3Key: `assets/${id}`,
    filename: shortName(file.name || 'upload'),
    mime,
    bytes: bytes.length,
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
  return Response.json({ assets: rows.map((r) => ({ id: r.id, filename: r.filename, mime: r.mime, bytes: r.bytes })) }, { status: 201 });
}

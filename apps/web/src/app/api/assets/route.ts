import { insertAssets } from '@cvs/db/assets';
import { db, MAX_BYTES, MAX_FILES, sniffImage } from '@/lib/assets';
import { guard } from '@/lib/session';
import { putObject } from '@/lib/storage';

/** Upload 1-4 input images (multipart field `file`): at most 10 MB each, JPEG/PNG/WebP by magic bytes. All or nothing. */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const form = await request.formData().catch(() => null);
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
  await Promise.all(checked.map(({ id, bytes, mime }) => putObject(`assets/${id}`, bytes, mime)));
  const rows = checked.map(({ id, file, bytes, mime }) => ({
    id,
    ownerId: g.session.user.id,
    kind: 'input' as const,
    s3Key: `assets/${id}`,
    filename: file.name || 'upload',
    mime,
    bytes: bytes.length,
  }));
  await insertAssets(db, rows);
  return Response.json({ assets: rows.map((r) => ({ id: r.id, filename: r.filename, mime: r.mime, bytes: r.bytes })) }, { status: 201 });
}

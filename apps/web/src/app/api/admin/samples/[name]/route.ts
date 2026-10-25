import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { headSample, MAX_SAMPLE_BYTES, SAMPLE_PREFIX, sampleBytesMatch, sampleType } from '@/lib/samples';
import { guard } from '@/lib/session';
import { deleteObject, putObject } from '@/lib/storage';

type Ctx = { params: Promise<{ name: string }> };

/** Admin: upload or replace one sample; the raw body is the file and its bytes must match the name's type. Audited as sample.put. */
export async function PUT(request: Request, { params }: Ctx) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { name } = await params;
  const mime = sampleType(name);
  if (!mime) return bad('name must be lower-case words joined by dashes with .mp4, .jpg, .png or .webp');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_SAMPLE_BYTES) return bad(`a sample is at most ${MAX_SAMPLE_BYTES} bytes`, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_SAMPLE_BYTES) return bad(`a sample has 1 to ${MAX_SAMPLE_BYTES} bytes`, 413);
  if (!sampleBytesMatch(mime, body)) return bad(`the file is not ${mime}`);
  const old = await headSample(name);
  // The object is written inside the transaction, so a failed upload leaves no audit row.
  await withTransaction(pool, async (tx) => {
    await audit(tx, { actorId: g.session.user.id, action: 'sample.put', target: `sample:${name}`, oldValue: old, newValue: { bytes: body.byteLength } });
    await putObject(SAMPLE_PREFIX + name, body, mime);
  });
  return Response.json({ name, bytes: body.byteLength }, { status: old ? 200 : 201 });
}

/** Admin: remove one sample, so its slot shows the built-in fallback again. Audited as sample.delete. */
export async function DELETE(request: Request, { params }: Ctx) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { name } = await params;
  const old = sampleType(name) && (await headSample(name));
  if (!old) return bad('not found', 404);
  await withTransaction(pool, async (tx) => {
    await audit(tx, { actorId: g.session.user.id, action: 'sample.delete', target: `sample:${name}`, oldValue: old, newValue: null });
    await deleteObject(SAMPLE_PREFIX + name);
  });
  return new Response(null, { status: 204 });
}

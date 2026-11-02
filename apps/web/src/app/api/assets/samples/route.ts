import { insertAssets } from '@cvs/db/assets';
import { db, MAX_BYTES, MAX_FILES, sniffImage } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { headSample, SAMPLE_PREFIX, sampleType } from '@/lib/samples';
import { guard } from '@/lib/session';
import { deleteObject, getObject, putObject } from '@/lib/storage';

/**
 * Copies 1-4 sample pictures (`{ names: ['try-on-model-1.jpg', ...] }`) into the caller's own input assets on the server, as if the caller had uploaded them.
 * A Recreate or "Use this" on an example used to download each sample to the browser and upload it back, two trips over a slow link for every photo.
 * The same checks as an upload apply: a JPEG, PNG or WebP image of at most 10 MB, by its magic bytes; all or nothing.
 * 429 once the caller has added COPY_HOURLY_LIMIT pictures (uploads included) in the last hour: here a tiny request makes the server copy up to 4 files of 10 MB, so a loop is held back (uploads themselves are not capped).
 */
export const COPY_HOURLY_LIMIT = 200;

export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { names?: unknown } | null;
  const names = body?.names;
  if (!Array.isArray(names) || names.length === 0 || names.length > MAX_FILES || !names.every((n) => typeof n === 'string' && sampleType(n)?.startsWith('image/'))) {
    return Response.json({ error: `send 1 to ${MAX_FILES} sample picture names in "names"` }, { status: 400 });
  }
  // shortcut: two copies sent at once can both pass the count and go a few over, fine for a guard against loops; take an advisory lock if it must be exact.
  const { n } = (await pool.query(`select count(*)::int as n from assets where owner_id = $1 and kind = 'input' and created_at > now() - interval '1 hour'`, [g.session.user.id])).rows[0];
  if (n + names.length > COPY_HOURLY_LIMIT) return Response.json({ error: `at most ${COPY_HOURLY_LIMIT} new pictures an hour; try again later` }, { status: 429 });
  const copies: { id: string; name: string; bytes: Uint8Array; mime: string }[] = [];
  for (const name of names as string[]) {
    const found = await headSample(name);
    if (!found) return Response.json({ error: `no sample ${name}` }, { status: 404 });
    if (found.bytes > MAX_BYTES) return Response.json({ error: `${name} is larger than 10 MB` }, { status: 413 });
    const bytes = new Uint8Array(await new Response(await getObject(SAMPLE_PREFIX + name)).arrayBuffer());
    const mime = sniffImage(bytes);
    if (!mime) return Response.json({ error: `${name} is not a JPEG, PNG or WebP image` }, { status: 415 });
    copies.push({ id: crypto.randomUUID(), name, bytes, mime });
  }
  const rows = copies.map(({ id, name, bytes, mime }) => ({ id, ownerId: g.session.user.id, kind: 'input' as const, s3Key: `assets/${id}`, filename: name, mime, bytes: bytes.length, durationMs: null }));
  const puts = await Promise.allSettled(copies.map(({ id, bytes, mime }) => putObject(`assets/${id}`, bytes, mime)));
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

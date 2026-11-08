import { createHash } from 'node:crypto';
import { insertAssets, keptInputs } from '@cvs/db/assets';
import { db, MAX_BYTES, MAX_FILES, mp4DurationMs, readJson, sniffImage, sniffVideo } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { headSample, MAX_SAMPLE_BYTES, SAMPLE_PREFIX, sampleType } from '@/lib/samples';
import { guard } from '@/lib/session';
import { isUploadSlot } from '@/lib/upload-slots';
import { deleteObject, getObject, putObject } from '@/lib/storage';

/**
 * Copies 1-4 sample pictures (`{ names: ['try-on-model-1.jpg', ...] }`) into the caller's own input assets on the server, as if the caller had uploaded them.
 * A Recreate or "Use this" on an example used to download each sample to the browser and upload it back, two trips over a slow link for every photo.
 * The same checks as an upload apply: a JPEG, PNG or WebP image of at most 10 MB, by its magic bytes; all or nothing. A sample clip (`marketing-example-1.mp4`) is copied the
 * same way, as an MP4 of at most 50 MB whose header gives its length (`durationMs`), for Marketing Studio Advanced's reference video; at most one clip a request, as the
 * server holds every file in memory.
 * An optional `slot` records the form slot they went into, as on an upload; a sample the caller already copied comes back as that copy, not a new one.
 * 429 once the caller has added COPY_HOURLY_LIMIT pictures (uploads included) in the last hour: here a tiny request makes the server copy up to 4 files of 10 MB, so a loop is held back (uploads have their own UPLOAD_HOURLY_LIMIT).
 */
export const COPY_HOURLY_LIMIT = 200;

export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await readJson(request)) as { names?: unknown; slot?: unknown } | null;
  const names = body?.names;
  if (!Array.isArray(names) || names.length === 0 || names.length > MAX_FILES || !names.every((n) => typeof n === 'string' && (sampleType(n)?.startsWith('image/') || sampleType(n) === 'video/mp4')) || names.filter((n) => sampleType(n as string) === 'video/mp4').length > 1) {
    return Response.json({ error: `send 1 to ${MAX_FILES} sample picture names in "names", or one sample clip` }, { status: 400 });
  }
  // shortcut: two copies sent at once can both pass the count and go a few over, fine for a guard against loops; take an advisory lock if it must be exact.
  const { n } = (await pool.query(`select count(*)::int as n from assets where owner_id = $1 and kind = 'input' and created_at > now() - interval '1 hour'`, [g.session.user.id])).rows[0];
  if (n + names.length > COPY_HOURLY_LIMIT) return Response.json({ error: `at most ${COPY_HOURLY_LIMIT} new pictures an hour; try again later` }, { status: 429 });
  const copies: { id: string; name: string; bytes: Uint8Array; mime: string; durationMs: number | null }[] = [];
  for (const name of names as string[]) {
    const found = await headSample(name);
    if (!found) return Response.json({ error: `no sample ${name}` }, { status: 404 });
    const clip = sampleType(name) === 'video/mp4';
    if (found.bytes > (clip ? MAX_SAMPLE_BYTES : MAX_BYTES)) return Response.json({ error: `${name} is larger than ${clip ? 50 : 10} MB` }, { status: 413 });
    const bytes = new Uint8Array(await new Response(await getObject(SAMPLE_PREFIX + name)).arrayBuffer());
    if (clip) {
      const durationMs = mp4DurationMs(bytes);
      if (!sniffVideo(bytes) || !durationMs) return Response.json({ error: `${name} is not an MP4 clip with a readable length` }, { status: 415 });
      copies.push({ id: crypto.randomUUID(), name, bytes, mime: 'video/mp4', durationMs });
      continue;
    }
    const mime = sniffImage(bytes);
    if (!mime) return Response.json({ error: `${name} is not a JPEG, PNG or WebP image` }, { status: 415 });
    copies.push({ id: crypto.randomUUID(), name, bytes, mime, durationMs: null });
  }
  const slot = isUploadSlot(body?.slot) ? body.slot : null;
  const hashes = copies.map((c) => createHash('sha256').update(c.bytes).digest('hex'));
  const kept = await keptInputs(pool, g.session.user.id, [...new Set(hashes)], slot);
  const fresh = copies.map((c, i) => ({ ...c, sha256: hashes[i]! })).filter((c, i) => !kept.has(c.sha256) && hashes.indexOf(c.sha256) === i);
  const rows = fresh.map(({ id, name, bytes, mime, durationMs, sha256 }) => ({ id, ownerId: g.session.user.id, kind: 'input' as const, s3Key: `assets/${id}`, filename: name, mime, bytes: bytes.length, durationMs, sha256, slot }));
  const puts = await Promise.allSettled(fresh.map(({ id, bytes, mime }) => putObject(`assets/${id}`, bytes, mime)));
  try {
    const failed = puts.find((p): p is PromiseRejectedResult => p.status === 'rejected');
    if (failed) throw failed.reason;
    await insertAssets(db, rows);
  } catch (e) {
    // No row points at these objects, so remove them rather than leave orphans.
    await Promise.allSettled(rows.map((r) => deleteObject(r.s3Key)));
    throw e;
  }
  const stored = new Map(rows.map((r) => [r.sha256, { id: r.id, filename: r.filename, mime: r.mime, bytes: r.bytes, durationMs: r.durationMs }]));
  return Response.json({ assets: hashes.map((h) => kept.get(h) ?? stored.get(h)!) }, { status: 201 });
}

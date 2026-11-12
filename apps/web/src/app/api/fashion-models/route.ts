import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { insertAssets } from '@cvs/db/assets';
import { bad, readBody } from '@/lib/admin';
import { db, sniffImage } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { parseFashionTraits } from '@/lib/fashion-model';
import { MAX_NAME, visibleFashionModels } from '@/lib/fashion-models';
import { guard } from '@/lib/session';
import { deleteObject, getObject, putObject } from '@/lib/storage';
import { COPY_HOURLY_LIMIT } from '../assets/samples/route';

/** The caller's saved AI models and the shared ones (an Admin sees all), newest first: `{ models }` (lib/fashion-models.ts). */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  return Response.json({ models: await visibleFashionModels(pool, g.session.user) });
}

/**
 * Save a result as a model: `{ assetId, name, shared? }`, the image output of one of the caller's own finished Fashion Model Generator jobs. The picture is copied into
 * a new input asset of theirs (an output is not an input, so a job cannot name it), as POST /api/assets/copy does, and the traits are the job's own. 201 with the model;
 * 404 for a result that is not theirs; 429 beyond COPY_HOURLY_LIMIT new files an hour. Audited `fashion_model.create`.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = await readBody(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (typeof body?.assetId !== 'string' || name.length < 1 || name.length > MAX_NAME || (body.shared !== undefined && typeof body.shared !== 'boolean')) {
    return bad(`send the result's "assetId", a "name" of 1 to ${MAX_NAME} characters and an optional "shared" true or false`);
  }
  const user = g.session.user;
  const found = (
    await pool.query(
      `select a.s3_key, j.params->>'traits' as traits from assets a join jobs j on j.output_asset_id = a.id
        where a.id = $1 and a.owner_id = $2 and a.kind = 'output' and a.mime like 'image/%' and a.deleted_at is null
          and j.feature = 'fashion_model' and j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null`,
      [body.assetId, user.id],
    )
  ).rows[0] as { s3_key: string; traits: string | null } | undefined;
  if (!found) return bad('the result does not exist or is not yours', 404);
  const { n } = (await pool.query(`select count(*)::int as n from assets where owner_id = $1 and kind = 'input' and created_at > now() - interval '1 hour'`, [user.id])).rows[0];
  if (n + 1 > COPY_HOURLY_LIMIT) return bad(`at most ${COPY_HOURLY_LIMIT} new files an hour; try again later`, 429);
  const bytes = new Uint8Array(await new Response(await getObject(found.s3_key)).arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return bad('the result is not a JPEG, PNG or WebP image', 415);
  const assetId = crypto.randomUUID();
  const modelId = crypto.randomUUID();
  const shared = body.shared === true;
  const row = { id: assetId, ownerId: user.id, kind: 'input' as const, s3Key: `assets/${assetId}`, filename: `ai-model-${assetId.slice(0, 8)}.${mime === 'image/jpeg' ? 'jpg' : mime.slice(6)}`, mime, bytes: bytes.length };
  let traits: unknown = null;
  try {
    traits = parseFashionTraits(JSON.parse(found.traits ?? 'null'));
  } catch {
    // a job without readable traits still saves, with none
  }
  try {
    await putObject(row.s3Key, bytes, mime);
    await insertAssets(db, [row]);
    await withTransaction(pool, async (tx) => {
      await tx.query('insert into fashion_models (id, user_id, name, asset_id, traits, shared) values ($1, $2, $3, $4, $5::jsonb, $6)', [modelId, user.id, name, assetId, JSON.stringify(traits ?? {}), shared]);
      await audit(tx, { actorId: user.id, action: 'fashion_model.create', target: `fashion_model:${modelId}`, newValue: { name, shared, assetId } });
    });
  } catch (e) {
    // No model points at the object, so remove it rather than leave an orphan.
    await pool.query('delete from assets where id = $1', [assetId]).catch(() => undefined);
    await Promise.allSettled([deleteObject(row.s3Key)]);
    throw e;
  }
  return Response.json((await visibleFashionModels(pool, user, modelId))[0], { status: 201 });
}

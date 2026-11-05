import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { CHOICE_SQL, choiceFields, listedChoice } from '@/lib/choices';
import { MAX_CHOICES } from '@/lib/marketing';
import { guard, isEditor } from '@/lib/session';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * Changes a choice: its owner their own, a template editor (an Admin too) any company or store one; 404 for any other. The body holds the fields to
 * change (lib/choices.ts choiceFields). Taking a company one back to private or a store needs room in the owner's 50. Answers with the choice as GET lists it.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return Response.json({ error: 'the body must be an object' }, { status: 400 });
  const userId = g.session.user.id;
  const r = (
    await pool.query(
      `select user_id, kind, name, phrase, description, is_company, store_id, niche, image_asset_id from user_choices
        where id = $1 and (user_id = $2 or ($3 and (is_company or store_id is not null)))`,
      [id, userId, isEditor(g.session.user)],
    )
  ).rows[0];
  if (!r) return notFound();
  const current = { name: r.name, phrase: r.phrase, desc: r.description ?? '', isCompany: r.is_company, storeId: r.store_id, niche: r.niche, imageAssetId: r.image_asset_id };
  const f = await choiceFields(b, g.session.user, current);
  if ('error' in f) return Response.json({ error: f.error }, { status: f.status });
  // shortcut: no lock, so two racing changes may both take the owner's 50th place; take POST's advisory lock if that ever matters.
  if (!f.isCompany && current.isCompany) {
    const n = (await pool.query('select count(*)::int as n from user_choices where user_id = $1 and kind = $2 and not is_company', [r.user_id, r.kind])).rows[0].n;
    if (n >= MAX_CHOICES) return Response.json({ error: `the owner keeps at most ${MAX_CHOICES} ${r.kind}s; delete one first` }, { status: 409 });
  }
  await pool.query('update user_choices set name = $2, phrase = $3, description = $4, is_company = $5, store_id = $6, niche = $7, image_asset_id = $8 where id = $1', [
    id, f.name, f.phrase, f.desc || null, f.isCompany, f.storeId, f.niche, f.imageAssetId,
  ]);
  return Response.json(listedChoice((await pool.query(`${CHOICE_SQL} where c.id = $2`, [userId, id])).rows[0]));
}

/** Deletes a choice: its owner their own, a template editor (an Admin too) any company or store one. Jobs and templates that name it keep the id, which the pages drop. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const res = await pool.query('delete from user_choices where id = $1 and (user_id = $2 or ($3 and (is_company or store_id is not null)))', [id, g.session.user.id, isEditor(g.session.user)]);
  return res.rowCount ? new Response(null, { status: 204 }) : notFound();
}

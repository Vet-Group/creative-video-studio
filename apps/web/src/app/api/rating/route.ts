import { randomUUID } from 'node:crypto';
import { readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { isRatingDue, parseRating, RATING_STATE_SQL } from '@/lib/rating';
import { guard, impersonationRefusal, isImpersonated } from '@/lib/session';

/** Whether the prompt should ask this member for a score now (lib/rating.ts). Never for an Admin signed in as the member, who could not send it. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (isImpersonated(g.session)) return Response.json({ due: false });
  const state = (await pool.query(RATING_STATE_SQL, [g.session.user.id])).rows[0];
  return Response.json({ due: isRatingDue(state) });
}

/** A member rates the app: `score` (an integer 1 to 10) and an optional `comment` (up to 1000 characters). The score is stored with the member's team now. */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  // An Admin signed in as a member must not rate for them.
  if (isImpersonated(g.session)) return impersonationRefusal();
  const parsed = parseRating(await readJson(request));
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  await pool.query('insert into ratings (id, user_id, team_id, score, comment) select $1, id, team_id, $3, $4 from users where id = $2', [randomUUID(), g.session.user.id, parsed.score, parsed.comment]);
  return Response.json({ ok: true }, { status: 201 });
}

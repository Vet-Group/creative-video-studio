import type { Queryable } from '@cvs/core/ledger';
import { googleEmail, type SignInMethod } from './sign-in-methods';

/** The sign-in methods linked to each user, oldest first: of every user, or of one. Only Google shows an email, read from its id_token. */
export async function userMethods(q: Queryable, userId?: string): Promise<Map<string, SignInMethod[]>> {
  const { rows } = await q.query(`select id, user_id, provider_id, id_token from accounts ${userId ? 'where user_id = $1' : ''} order by created_at, id`, userId ? [userId] : []);
  const byUser = new Map<string, SignInMethod[]>();
  for (const r of rows) {
    const method = { id: r.id, provider: r.provider_id, email: r.provider_id === 'google' ? googleEmail(r.id_token) : null };
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), method]);
  }
  return byUser;
}

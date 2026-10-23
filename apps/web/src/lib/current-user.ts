import { headers } from 'next/headers';
import { auth } from './auth';

/** For pages: the signed-in user of this request, or null without a session or for a banned user (the same rule as `guard`). */
export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session && !session.user.banned ? session.user : null;
}

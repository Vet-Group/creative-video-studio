import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/current-user';
import { loginFor } from '@/lib/return-to';
import { ForcedChange } from './ForcedChange';

// Outside the (app) group on purpose: its layout sends a user with a temporary password here, and this page shows nothing else.
export default async function ForcedPasswordPage() {
  const user = await currentUser();
  if (!user) redirect(loginFor((await headers()).get('x-cvs-path')));
  if (!user.mustChangePassword) redirect('/create');
  return <ForcedChange email={user.email} />;
}

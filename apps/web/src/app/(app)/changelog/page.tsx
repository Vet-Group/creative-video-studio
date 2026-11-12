import { redirect } from 'next/navigation';
import { Changelog } from '@/components/Changelog';
import { CHANGELOG } from '@/lib/changelog';
import { visibleEntries } from '@/lib/changelog-seen';
import { currentUser } from '@/lib/current-user';

/** The changelog page: what changed in the app, by day. Admin-only entries and PR numbers are cut here, so a member's browser never receives them. */
export default async function ChangelogPage() {
  // The (app) layout does not rerun on a client navigation, so a page that reads the user itself checks the forced password change again.
  const user = await currentUser();
  if (user?.mustChangePassword) redirect('/account/password');
  const isAdmin = user?.role === 'admin';
  return <Changelog entries={visibleEntries(CHANGELOG, isAdmin)} isAdmin={isAdmin} />;
}

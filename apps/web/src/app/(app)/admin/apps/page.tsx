import { notFound, redirect } from 'next/navigation';
import { AdminApps } from '@/components/admin/AdminApps';
import { currentUser } from '@/lib/current-user';
import { adminApps } from '@/lib/custom-apps-db';

// The role is checked here too: the admin layout does not protect a page's own payload on a client navigation.
export default async function AppsPage() {
  const user = await currentUser();
  if (user?.mustChangePassword) redirect('/account/password'); // the (app) layout does not rerun on a client navigation, as on Explore
  if (user?.role !== 'admin' || !user.workspaceId) notFound();
  return <AdminApps rows={await adminApps(user.workspaceId)} />;
}

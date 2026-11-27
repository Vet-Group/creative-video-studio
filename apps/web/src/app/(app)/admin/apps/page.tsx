import { notFound } from 'next/navigation';
import { AdminApps } from '@/components/admin/AdminApps';
import { currentUser } from '@/lib/current-user';
import { adminApps } from '@/lib/custom-apps-db';

// The role is checked here too: the admin layout does not protect a page's own payload on a client navigation.
export default async function AppsPage() {
  const user = await currentUser();
  if (user?.role !== 'admin' || !user.workspaceId) notFound();
  return <AdminApps rows={await adminApps(user.workspaceId)} />;
}

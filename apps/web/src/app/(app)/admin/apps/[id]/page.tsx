import { notFound, redirect } from 'next/navigation';
import { AppEditor } from '@/components/admin/AppEditor';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { adminApp, appSource } from '@/lib/custom-apps-db';

// The role is checked here too: the admin layout does not protect a page's own payload (the app's prompt) on a client navigation.
export default async function EditAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (user?.mustChangePassword) redirect('/account/password'); // the (app) layout does not rerun on a client navigation, as on Explore
  if (user?.role !== 'admin' || !user.workspaceId) notFound();
  const app = await adminApp(id, user.workspaceId);
  const source = app && (await appSource(pool, app.sourceJobId, user.workspaceId));
  if (!app || !source) notFound(); // an app whose clip is gone has nothing to edit: it can only be taken down or deleted
  return <AppEditor jobId={app.sourceJobId} source={source} app={app} />;
}

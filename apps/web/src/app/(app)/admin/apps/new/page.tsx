import { notFound, redirect } from 'next/navigation';
import { AppEditor } from '@/components/admin/AppEditor';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { appSource } from '@/lib/custom-apps-db';

// The role is checked here too: the admin layout does not protect a page's own payload (the clip's prompt) on a client navigation.
export default async function NewAppPage({ searchParams }: { searchParams: Promise<{ job?: string | string[] }> }) {
  const { job } = await searchParams;
  const user = await currentUser();
  if (user?.mustChangePassword) redirect('/account/password'); // the (app) layout does not rerun on a client navigation, as on Explore
  if (user?.role !== 'admin' || !user.workspaceId || typeof job !== 'string' || !/^[\w-]{1,64}$/.test(job)) notFound();
  const source = await appSource(pool, job, user.workspaceId);
  if (!source) notFound();
  return <AppEditor jobId={job} source={source} />;
}

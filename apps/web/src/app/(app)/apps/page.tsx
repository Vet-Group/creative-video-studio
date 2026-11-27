import { AppsIndex } from '@/components/AppsIndex';
import { currentUser } from '@/lib/current-user';
import { publishedApps } from '@/lib/custom-apps-db';

export default async function AppsPage() {
  const user = await currentUser();
  return <AppsIndex extra={user?.workspaceId ? await publishedApps(user.workspaceId) : []} />;
}

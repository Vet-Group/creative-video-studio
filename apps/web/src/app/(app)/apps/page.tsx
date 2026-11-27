import { AppsIndex } from '@/components/AppsIndex';
import { JOB_APPS } from '@/lib/apps';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { publishedApps } from '@/lib/custom-apps-db';
import { weeklyUses } from '@/lib/popular';

export default async function AppsPage() {
  const user = await currentUser();
  // Custom apps and Smart Remake run on the `video` and `image` features of Create, so they get no count of their own (JOB_APPS leaves Smart Remake out).
  const [extra, { features }] = user?.workspaceId ? await Promise.all([publishedApps(user.workspaceId), weeklyUses(pool, user.workspaceId)]) : [[], { features: new Map<string, number>() }];
  return <AppsIndex extra={extra} uses={Object.fromEntries(JOB_APPS.map((a) => [a.slug, features.get(a.feature) ?? 0]))} />;
}

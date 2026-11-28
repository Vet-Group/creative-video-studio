import { AppsIndex } from '@/components/AppsIndex';
import { JOB_APPS } from '@/lib/apps';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { publishedApps } from '@/lib/custom-apps-db';
import { weeklyUses } from '@/lib/popular';

export default async function AppsPage() {
  const user = await currentUser();
  // A custom app counts under its id (its jobs carry params.app) and Smart Remake under `smart_remake` (a row of remakes, no job), so neither adds to Create's or Image Generation's count (lib/popular.ts); JOB_APPS leaves Smart Remake out.
  const [extra, { features }] = user?.workspaceId ? await Promise.all([publishedApps(user.workspaceId), weeklyUses(pool, user.workspaceId)]) : [[], { features: new Map<string, number>() }];
  return <AppsIndex extra={extra} uses={{ ...Object.fromEntries(JOB_APPS.map((a) => [a.slug, features.get(a.feature) ?? 0])), 'smart-remake': features.get('smart_remake') ?? 0, ...Object.fromEntries(extra.map((a) => [a.slug, features.get(`app:${a.slug}`) ?? 0])) }} />;
}

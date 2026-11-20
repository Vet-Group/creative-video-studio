import { notFound } from 'next/navigation';
import { AnalyzeView } from '@/components/AnalyzeView';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { reaRemakeEnabled, sharedVideos } from '@/lib/remake';

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ analysis?: string | string[] }> }) {
  if (!reaAnalyzeEnabled()) notFound();
  const { analysis } = await searchParams;
  // An analysis id to open (a shared link): an id-shaped value only, which the API still checks belongs to the member or is shared.
  const initialId = typeof analysis === 'string' && /^[\w-]{1,64}$/.test(analysis) ? analysis : undefined;
  const user = await currentUser();
  const remakeEnabled = reaRemakeEnabled();
  // The shelf sits above the Examples: rendered with the page, it does not push them down when a client fetch would have brought it.
  const shared = remakeEnabled && user?.workspaceId ? await sharedVideos(pool, user.workspaceId) : [];
  return <AnalyzeView initialId={initialId} remakeEnabled={remakeEnabled} isAdmin={user?.role === 'admin'} initialShared={shared} />;
}

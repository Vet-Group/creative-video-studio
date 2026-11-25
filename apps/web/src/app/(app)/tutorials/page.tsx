import { redirect } from 'next/navigation';
import { Tutorials } from '@/components/Tutorials';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { currentUser } from '@/lib/current-user';

/** The tutorials page, the sidebar's guide item. */
export default async function TutorialsPage() {
  // The (app) layout does not rerun on a client navigation, so a page that reads the user itself checks the forced password change again.
  const user = await currentUser();
  if (user?.mustChangePassword) redirect('/account/password');
  return <Tutorials analyzeEnabled={reaAnalyzeEnabled()} />;
}

import { FeedbackDetail } from '@/components/FeedbackDetail';
import { CHANGELOG } from '@/lib/changelog';
import { visibleEntries } from '@/lib/changelog-seen';
import { currentUser } from '@/lib/current-user';

export default async function FeedbackItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const isAdmin = user?.role === 'admin';
  // The changelog entries that answer this item, newest first, as the reader may see them.
  const shipped = visibleEntries(CHANGELOG, isAdmin)
    .filter((e) => e.feedback?.includes(id))
    .map((e) => ({ at: e.at, title: e.title }));
  return <FeedbackDetail id={id} isAdmin={isAdmin} shipped={shipped} />;
}

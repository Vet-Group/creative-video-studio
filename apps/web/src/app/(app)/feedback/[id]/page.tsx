import { FeedbackDetail } from '@/components/FeedbackDetail';
import { currentUser } from '@/lib/current-user';

export default async function FeedbackItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  return <FeedbackDetail id={id} isAdmin={user?.role === 'admin'} />;
}

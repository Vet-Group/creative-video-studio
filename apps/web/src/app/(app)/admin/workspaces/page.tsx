import { AdminWorkspaces } from '@/components/admin/AdminWorkspaces';
import { currentUser } from '@/lib/current-user';

export default async function WorkspacesPage() {
  const user = await currentUser();
  return <AdminWorkspaces meId={user?.id ?? ''} />;
}

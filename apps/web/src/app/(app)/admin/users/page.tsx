import { AdminUsers } from '@/components/admin/AdminUsers';
import { currentUser } from '@/lib/current-user';

export default async function UsersPage() {
  const user = await currentUser();
  // The switch and the sign-in-as action are for a developer Admin, and not while signed in as someone (the route refuses that).
  return <AdminUsers meId={user?.id ?? ''} canImpersonate={user?.canImpersonate === true && !user.impersonatedBy} />;
}

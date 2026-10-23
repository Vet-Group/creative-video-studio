import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { currentUser } from '@/lib/current-user';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <Shell userId={user.id} userName={user.name} isAdmin={user.role === 'admin'}>
      {children}
    </Shell>
  );
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { googleLoginEnabled, larkLoginEnabled, pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { COLLAPSED_COOKIE } from '@/lib/sidebar';
import { userMethods } from '@/lib/user-methods';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const isAdmin = user.role === 'admin';
  const account = {
    email: user.email,
    isAdmin,
    methods: (await userMethods(pool, user.id)).get(user.id) ?? [],
    googleEnabled: googleLoginEnabled,
    larkEnabled: larkLoginEnabled,
    supportEmail: process.env.CVS_SUPPORT_EMAIL || null,
  };
  return (
    <Shell userId={user.id} userName={user.name} isAdmin={isAdmin} account={account} initialCollapsed={(await cookies()).get(COLLAPSED_COOKIE)?.value === '1'}>
      {children}
    </Shell>
  );
}

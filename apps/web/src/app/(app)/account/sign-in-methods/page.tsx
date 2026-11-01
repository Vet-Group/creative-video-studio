import { redirect } from 'next/navigation';
import { SignInMethods } from '@/components/SignInMethods';
import { googleLoginEnabled, larkLoginEnabled, pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import type { PasskeyItem } from '@/lib/sign-in-methods';
import { userMethods } from '@/lib/user-methods';

export default async function SignInMethodsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { error } = await searchParams;
  const methods = (await userMethods(pool, user.id)).get(user.id) ?? [];
  const passkeys: PasskeyItem[] = (await pool.query('select id, created_at from passkeys where user_id = $1 order by created_at, id', [user.id])).rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
  }));
  return (
    <SignInMethods
      methods={methods}
      passkeys={passkeys}
      googleEnabled={googleLoginEnabled}
      larkEnabled={larkLoginEnabled}
      error={typeof error === 'string' ? error : undefined}
    />
  );
}

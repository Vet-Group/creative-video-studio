import { redirect } from 'next/navigation';
import { SignInMethods } from '@/components/SignInMethods';
import { googleLoginEnabled, larkLoginEnabled, pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { userMethods } from '@/lib/user-methods';

export default async function SignInMethodsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { error } = await searchParams;
  const methods = (await userMethods(pool, user.id)).get(user.id) ?? [];
  return <SignInMethods methods={methods} googleEnabled={googleLoginEnabled} larkEnabled={larkLoginEnabled} error={typeof error === 'string' ? error : undefined} />;
}

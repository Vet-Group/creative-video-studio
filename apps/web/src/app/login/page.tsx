import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { googleLoginEnabled, larkLoginEnabled } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await currentUser()) redirect('/create');
  const { error } = await searchParams;
  // Set by better-auth's lastLoginMethod plugin after each sign-in in this browser.
  const lastMethod = (await cookies()).get('better-auth.last_used_login_method')?.value;
  return (
    <LoginForm googleEnabled={googleLoginEnabled} larkEnabled={larkLoginEnabled} lastMethod={lastMethod} error={typeof error === 'string' ? error : undefined} />
  );
}

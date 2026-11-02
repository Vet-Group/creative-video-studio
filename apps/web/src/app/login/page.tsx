import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { googleLoginEnabled, larkLoginEnabled } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { returnTo } from '@/lib/return-to';
import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; next?: string | string[] }> }) {
  const { error, next: page } = await searchParams;
  const next = returnTo(page);
  if (await currentUser()) redirect(next);
  // Set by better-auth's lastLoginMethod plugin after each sign-in in this browser.
  const lastMethod = (await cookies()).get('better-auth.last_used_login_method')?.value;
  return (
    <LoginForm googleEnabled={googleLoginEnabled} larkEnabled={larkLoginEnabled} lastMethod={lastMethod} next={next} error={typeof error === 'string' ? error : undefined} />
  );
}

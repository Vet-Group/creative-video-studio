import { redirect } from 'next/navigation';
import { googleLoginEnabled, larkLoginEnabled } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await currentUser()) redirect('/create');
  const { error } = await searchParams;
  return <LoginForm googleEnabled={googleLoginEnabled} larkEnabled={larkLoginEnabled} error={typeof error === 'string' ? error : undefined} />;
}

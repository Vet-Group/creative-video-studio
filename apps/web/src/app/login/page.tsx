import { redirect } from 'next/navigation';
import { larkLoginEnabled } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await currentUser()) redirect('/create');
  return <LoginForm larkEnabled={larkLoginEnabled} />;
}

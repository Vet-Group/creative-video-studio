import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/current-user';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await currentUser()) redirect('/create');
  // The Lark button appears only once the Lark app is configured on the server.
  const larkEnabled = Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
  return <LoginForm larkEnabled={larkEnabled} />;
}

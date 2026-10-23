import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/current-user';

export default async function Home() {
  redirect((await currentUser()) ? '/create' : '/login');
}

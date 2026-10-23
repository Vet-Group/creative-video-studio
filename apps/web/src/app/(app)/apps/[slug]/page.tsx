import { notFound } from 'next/navigation';
import { AppPage } from '@/components/AppPage';
import { appBySlug } from '@/lib/apps';

export default async function AppRoute({ params }: { params: Promise<{ slug: string }> }) {
  const app = appBySlug((await params).slug);
  if (!app) notFound();
  return <AppPage key={app.slug} app={app} />; // the key starts a fresh form when the app is changed
}

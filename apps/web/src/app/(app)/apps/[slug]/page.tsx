import { notFound } from 'next/navigation';
import { AppPage } from '@/components/AppPage';
import { appBySlug } from '@/lib/apps';
import { refillFrom } from '@/lib/reuse';

export default async function AppRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ reuse?: string; template?: string }> }) {
  const app = appBySlug((await params).slug);
  if (!app) notFound();
  const from = refillFrom(await searchParams);
  return <AppPage key={`${app.slug}/${from ?? ''}`} app={app} reuse={from} />; // the key starts a fresh form when the app or the refill source changes
}

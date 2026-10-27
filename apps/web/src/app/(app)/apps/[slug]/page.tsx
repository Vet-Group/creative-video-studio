import { notFound } from 'next/navigation';
import { AppPage } from '@/components/AppPage';
import { appBySlug } from '@/lib/apps';

export default async function AppRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ reuse?: string }> }) {
  const app = appBySlug((await params).slug);
  if (!app) notFound();
  const { reuse } = await searchParams;
  return <AppPage key={`${app.slug}/${reuse ?? ''}`} app={app} reuse={typeof reuse === 'string' ? reuse : undefined} />; // the key starts a fresh form when the app or the reused job changes
}

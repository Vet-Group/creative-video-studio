import { notFound } from 'next/navigation';
import { AppPage } from '@/components/AppPage';
import { FashionModelApp } from '@/components/FashionModelApp';
import { MediaOptimizer } from '@/components/MediaOptimizer';
import { SmartRemakeApp } from '@/components/SmartRemakeApp';
import { appBySlug } from '@/lib/apps';
import { currentUser } from '@/lib/current-user';
import { smartRemakeAppEnabled } from '@/lib/remake';
import { refillFrom } from '@/lib/reuse';

export default async function AppRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ reuse?: string; template?: string }> }) {
  const app = appBySlug((await params).slug);
  if (!app) notFound();
  if (app.slug === 'smart-remake') return smartRemakeAppEnabled() ? <SmartRemakeApp app={app} /> : notFound(); // off unless both REA flags are on
  if (app.slug === 'media-optimizer') return <MediaOptimizer app={app} />;
  if (app.slug === 'ai-fashion-model') return <FashionModelApp app={app} isAdmin={(await currentUser())?.role === 'admin'} />;
  const from = refillFrom(await searchParams);
  return <AppPage key={`${app.slug}/${from ?? ''}`} app={app} reuse={from} />; // the key starts a fresh form when the app or the refill source changes
}

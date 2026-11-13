import { notFound } from 'next/navigation';
import { AppPage } from '@/components/AppPage';
import { FashionModelApp } from '@/components/FashionModelApp';
import { MediaOptimizer } from '@/components/MediaOptimizer';
import { SmartRemakeApp } from '@/components/SmartRemakeApp';
import { appBySlug } from '@/lib/apps';
import { currentUser } from '@/lib/current-user';
import { smartRemakeAppEnabled } from '@/lib/remake';
import { refillFrom } from '@/lib/reuse';

export default async function AppRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ reuse?: string; template?: string; analysis?: string | string[] }> }) {
  const app = appBySlug((await params).slug);
  if (!app) notFound();
  if (app.slug === 'smart-remake') {
    if (!smartRemakeAppEnabled()) notFound(); // off unless both REA flags are on
    // An analysis id to open again: an id-shaped value only, which the API still checks belongs to the member. The key starts the app afresh for another one.
    const { analysis } = await searchParams;
    const initialId = typeof analysis === 'string' && /^[\w-]{1,64}$/.test(analysis) ? analysis : undefined;
    return <SmartRemakeApp key={initialId ?? ''} app={app} initialId={initialId} />;
  }
  if (app.slug === 'media-optimizer') return <MediaOptimizer app={app} />;
  if (app.slug === 'ai-fashion-model') return <FashionModelApp app={app} isAdmin={(await currentUser())?.role === 'admin'} />;
  const from = refillFrom(await searchParams);
  return <AppPage key={`${app.slug}/${from ?? ''}`} app={app} reuse={from} />; // the key starts a fresh form when the app or the refill source changes
}

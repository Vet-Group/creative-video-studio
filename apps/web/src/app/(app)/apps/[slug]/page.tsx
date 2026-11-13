import { notFound } from 'next/navigation';
import { AppPage } from '@/components/AppPage';
import { FashionModelApp } from '@/components/FashionModelApp';
import { MediaOptimizer } from '@/components/MediaOptimizer';
import { SmartRemakeApp } from '@/components/SmartRemakeApp';
import { appBySlug } from '@/lib/apps';
import { currentUser } from '@/lib/current-user';
import { smartRemakeAppEnabled } from '@/lib/remake';
import { refillFrom } from '@/lib/reuse';

export default async function AppRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ reuse?: string; template?: string; analysis?: string | string[]; product?: string | string[] }> }) {
  const app = appBySlug((await params).slug);
  if (!app) notFound();
  if (app.slug === 'smart-remake') {
    if (!smartRemakeAppEnabled()) notFound(); // off unless both REA flags are on
    // An analysis and a product image to open again: id-shaped values only, which the APIs still check belong to the member. The key starts the app afresh for others.
    const { analysis, product } = await searchParams;
    const id = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : undefined);
    const initialId = id(analysis);
    const initialProductId = initialId && id(product);
    return <SmartRemakeApp key={`${initialId ?? ''}:${initialProductId ?? ''}`} app={app} initialId={initialId} initialProductId={initialProductId} />;
  }
  if (app.slug === 'media-optimizer') return <MediaOptimizer app={app} />;
  if (app.slug === 'ai-fashion-model') return <FashionModelApp app={app} isAdmin={(await currentUser())?.role === 'admin'} />;
  const from = refillFrom(await searchParams);
  return <AppPage key={`${app.slug}/${from ?? ''}`} app={app} reuse={from} />; // the key starts a fresh form when the app or the refill source changes
}

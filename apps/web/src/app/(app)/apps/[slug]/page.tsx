import { notFound } from 'next/navigation';
import { AppPage } from '@/components/AppPage';
import { FashionModelApp } from '@/components/FashionModelApp';
import { HookEffectsApp } from '@/components/HookEffectsApp';
import { MediaOptimizer } from '@/components/MediaOptimizer';
import { SmartRemakeApp } from '@/components/SmartRemakeApp';
import { appBySlug } from '@/lib/apps';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { smartRemakeAppEnabled } from '@/lib/remake';
import { exampleFrom, refillFrom } from '@/lib/reuse';

export default async function AppRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ reuse?: string; template?: string; example?: string; analysis?: string | string[]; product?: string | string[]; image?: string | string[] }> }) {
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
  const q = await searchParams;
  if (app.slug === 'ai-fashion-model') {
    const from = refillFrom(q); // History's or the Library's Dùng lại: the job's traits back on the form
    return <FashionModelApp key={from} app={app} reuse={from} isAdmin={(await currentUser())?.role === 'admin'} />;
  }
  if (app.slug === 'hook-effects') {
    const from = refillFrom(q); // History's or the Library's Dùng lại: the job's photo and effect back on the form
    return <HookEffectsApp key={from} app={app} reuse={from} />;
  }
  const from = refillFrom(q) ?? exampleFrom(q);
  // A photo for the first slot (History's Background Remover and Image Upscale buttons copy a result into a new input first): only the member's own image input in the active workspace.
  const user = typeof q.image === 'string' && !from ? await currentUser() : null;
  const [image] = user?.workspaceId
    ? (
        await pool.query<{ id: string; filename: string }>(
          `select id, filename from assets where id = $1 and owner_id = $2 and workspace_id = $3 and kind = 'input' and deleted_at is null and mime like 'image/%'`,
          [q.image, user.id, user.workspaceId],
        )
      ).rows
    : [];
  return <AppPage key={`${app.slug}/${from ?? image?.id ?? ''}`} app={app} reuse={from} image={image} />; // the key starts a fresh form when the app or the refill source changes
}

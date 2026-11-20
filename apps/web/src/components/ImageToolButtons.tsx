'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { appBySlug } from '@/lib/apps';
import { Icon } from './Icon';

/** The apps an image result opens in, as a new input in their first slot: those not marked as coming soon. */
const IMAGE_TOOLS = ([['background-remover', 'wand'], ['image-upscale', 'expand']] as const).flatMap(([slug, icon]) => {
  const app = appBySlug(slug);
  return app && !app.soon ? [{ ...app, icon }] : [];
});

/**
 * Background Remover and Image Upscale on one of the member's own image results (a History card, a Library detail), except the one that made it: the result is copied
 * into a new input of the member's (POST /api/assets/copy, which takes only the caller's own results), which the app's page puts in its first slot.
 * `act` runs the copy and shows its failure, as the caller's other actions do.
 */
export function ImageToolButtons({ assetId, feature, className, act }: { assetId: string; feature: string; className: string; act: (what: () => Promise<unknown>, fail: string) => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const openIn = async (slug: string) => {
    setBusy(true); // from the click on, so a double click copies once
    await act(async () => {
      const [copy] = (await api<{ assets: { id: string }[] }>('/api/assets/copy', sendJson('POST', { assetId }))).assets;
      router.push(`/apps/${slug}?image=${copy!.id}`);
    }, 'Không mở được ảnh này.');
    setBusy(false);
  };
  return IMAGE_TOOLS.filter((a) => a.feature !== feature).map((a) => (
    <button key={a.slug} type="button" className={className} disabled={busy} onClick={() => void openIn(a.slug)}>
      <Icon name={a.icon} /> {a.name}
    </button>
  ));
}

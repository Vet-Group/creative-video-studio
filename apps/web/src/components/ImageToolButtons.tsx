'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { appBySlug } from '@/lib/apps';
import { Icon, type IconName } from './Icon';

/** An app an image result opens in: `from` keeps it to the results of those features, `not` keeps it off them, `video` offers it on a clip's first frame too, and `label` names its button (else the app's name). */
type Tool = { slug: string; icon: IconName; label?: string; from?: string[]; not?: string[]; video?: boolean };

/** The apps an image result opens in, as a new input in their first slot: those not marked as coming soon. */
const IMAGE_TOOLS = (
  [
    { slug: 'background-remover', icon: 'wand' },
    { slug: 'image-upscale', icon: 'expand' },
    { slug: 'background-changer', icon: 'image' },
    { slug: 'reframe', icon: 'ratio' },
    // A person's result, an AI model's or a Try On's, in other poses.
    { slug: 'pose-generator', icon: 'model', label: 'Đổi tư thế', from: ['fashion_model', 'try_on'] },
    // Any result that may show the seller's printed product, a clip's first frame too; not a cutout or an upscale (its print is the source's), nor an AI model, a pet portrait (a design itself),
    // jewelry or lingerie, nor a hook effect, whose first frame is the start of the effect and whose remake would lose it.
    { slug: 'print-fix', icon: 'edit', not: ['background_remover', 'image_upscale', 'fashion_model', 'pet_portrait', 'jewelry_try_on', 'lingerie_try_on', 'hook_effect'], video: true },
  ] as Tool[]
).flatMap(({ slug, ...tool }) => {
  const app = appBySlug(slug);
  return app && !app.soon ? [{ ...app, ...tool, label: tool.label ?? app.name }] : [];
});

/** The tools a result of `feature` offers, by their app slugs: an image result's, or with `video` a clip's first frame's; never the app that made it. */
export const resultTools = (feature: string, video = false): string[] =>
  IMAGE_TOOLS.filter((a) => a.feature !== feature && (!a.from || a.from.includes(feature)) && !a.not?.includes(feature) && (!video || a.video)).map((a) => a.slug);

/**
 * Background Remover, Image Upscale, Background Changer and Reframe on an image result (the member's own on a History card, any member's in a Library detail), except the one that made it,
 * the pose generator on an AI model's or a Try On's result, and the print fix on a result that may show a print (`video`: `assetId` is a clip's poster, its first frame): the
 * result is copied into a new input of the member's (POST /api/assets/copy), which the app's page puts in its first slot.
 * `act` runs the copy and shows its failure, as the caller's other actions do.
 */
export function ImageToolButtons({ assetId, feature, video = false, className, act }: { assetId: string; feature: string; video?: boolean; className: string; act: (what: () => Promise<unknown>, fail: string) => Promise<void> }) {
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
  const tools = resultTools(feature, video);
  return IMAGE_TOOLS.filter((a) => tools.includes(a.slug)).map((a) => (
    <button key={a.slug} type="button" className={className} disabled={busy} onClick={() => void openIn(a.slug)}>
      <Icon name={a.icon} /> {a.label}
    </button>
  ));
}

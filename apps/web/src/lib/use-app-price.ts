// The price and model of a custom app's run page (components/CustomAppForm.tsx), read from the model lists the app's own pair of duplicate models appears in.
import { useEffect, useState } from 'react';
import type { ImageModel } from '@/components/image-tools';
import { api } from './api';
import type { CustomAppConfig, CustomAppSettings } from './custom-apps';

/** `row` is the listed model of the app's pair with its price of one run; null when no row of the pair is enabled. */
export interface AppPrice {
  loading: boolean;
  failed: boolean;
  row: { label: string; usd: string } | null;
}

interface VideoModel {
  id: string;
  label: string;
  estimateUsd: string;
  audioEstimateUsd: string | null;
}

/** The listed row of the app's pair and its unit price, as the other forms show it (no extra for the inputs: the server's estimate stays the authority). Null when no
 * row of the pair is listed, or an image row has no price for the app's resolution: the page then says the model is off instead of showing $0.00. */
export function appPrice(feature: string, models: (VideoModel | ImageModel)[], custom: Pick<CustomAppSettings, 'modelIds' | 'audio' | 'resolution' | 'thinking'>): AppPrice['row'] {
  const m = models.find((x) => custom.modelIds.includes(x.id));
  if (!m) return null;
  if (feature === 'video') {
    const v = m as VideoModel;
    return { label: v.label, usd: (custom.audio === 'on' && v.audioEstimateUsd) || v.estimateUsd };
  }
  const i = m as ImageModel;
  const size = custom.resolution ?? i.resolutions[0] ?? '';
  const usd = (custom.thinking && i.thinkingPrices[custom.thinking]?.[size]) || i.prices[size];
  return usd ? { label: i.label, usd } : null;
}

export function useAppPrice(app: Pick<CustomAppConfig, 'feature' | 'custom'>): AppPrice {
  const { modelIds, ratio, durationSec, inputCount, audio, resolution, thinking } = app.custom;
  const [state, setState] = useState<AppPrice>({ loading: true, failed: false, row: null });
  useEffect(() => {
    const list =
      app.feature === 'video'
        ? `/api/models?feature=video&ratio=${encodeURIComponent(ratio)}&durationSec=${durationSec}&images=${inputCount}`
        : '/api/image-models?feature=image';
    api<{ models: (VideoModel | ImageModel)[] }>(list).then(
      (r) => setState({ loading: false, failed: false, row: appPrice(app.feature, r.models, { modelIds, audio, resolution, thinking }) }),
      () => setState({ loading: false, failed: true, row: null }),
    );
  }, [app.feature, modelIds, ratio, durationSec, inputCount, audio, resolution, thinking]);
  return state;
}

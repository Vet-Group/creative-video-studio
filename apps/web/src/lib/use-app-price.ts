// The price and model of a custom app's run page (components/CustomAppForm.tsx), read from the model lists the app's own pair of duplicate models appears in.
import { useEffect, useState } from 'react';
import { api } from './api';
import type { CustomAppConfig } from './custom-apps';

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
interface ImageModel {
  id: string;
  label: string;
  resolutions: string[];
  prices: Record<string, string>;
  thinkingPrices: Record<string, Record<string, string>>;
}

/** The unit price, as the other forms show it (no extra for the inputs: the server's estimate stays the authority). */
export function useAppPrice(app: Pick<CustomAppConfig, 'feature' | 'custom'>): AppPrice {
  const { modelIds, ratio, durationSec, inputCount, audio, resolution, thinking } = app.custom;
  const [state, setState] = useState<AppPrice>({ loading: true, failed: false, row: null });
  useEffect(() => {
    const ours = (m: { id: string }) => modelIds.includes(m.id);
    const load =
      app.feature === 'video'
        ? api<{ models: VideoModel[] }>(`/api/models?feature=video&ratio=${encodeURIComponent(ratio)}&durationSec=${durationSec}&images=${inputCount}`).then((r) => {
            const m = r.models.find(ours);
            return m ? { label: m.label, usd: (audio === 'on' && m.audioEstimateUsd) || m.estimateUsd } : null;
          })
        : api<{ models: ImageModel[] }>('/api/image-models?feature=image').then((r) => {
            const m = r.models.find(ours);
            const size = resolution ?? m?.resolutions[0] ?? '';
            return m ? { label: m.label, usd: (thinking && m.thinkingPrices[thinking]?.[size]) || m.prices[size] || '0.0000' } : null;
          });
    load.then(
      (row) => setState({ loading: false, failed: false, row }),
      () => setState({ loading: false, failed: true, row: null }),
    );
  }, [app.feature, modelIds, ratio, durationSec, inputCount, audio, resolution, thinking]);
  return state;
}

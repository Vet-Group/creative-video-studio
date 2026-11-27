import type { ImageModel } from '@/components/image-tools';
import { expect, test } from 'vitest';
import { appPrice } from './use-app-price';

const video = (id: string, usd: string, audio: string | null = null) => ({ id, label: id, estimateUsd: usd, audioEstimateUsd: audio });
const image = (id: string, prices: Record<string, string>, thinkingPrices: Record<string, Record<string, string>> = {}) =>
  ({ id, label: id, resolutions: Object.keys(prices), prices, thinkingPrices }) as unknown as ImageModel;

test('a video app is priced by the row of its pair the list offers, the dearer twin too, with the audio price when its audio is on', () => {
  const pair = { modelIds: ['tw-cheap', 'tw-dear'] };
  expect(appPrice('video', [video('other', '0.1000'), video('tw-dear', '1.5000', '2.0000')], pair)).toEqual({ label: 'tw-dear', usd: '1.5000' });
  expect(appPrice('video', [video('tw-dear', '1.5000', '2.0000')], { ...pair, audio: 'on' })).toEqual({ label: 'tw-dear', usd: '2.0000' });
  expect(appPrice('video', [video('tw-dear', '1.5000')], { ...pair, audio: 'on' })).toEqual({ label: 'tw-dear', usd: '1.5000' }); // no audio price: the clip's price
  expect(appPrice('video', [video('other', '0.1000')], pair)).toBeNull();
});

test('an image app is priced at its resolution and thinking level, and an unpriced resolution is no price rather than $0.00', () => {
  const m = image('img', { '1K': '0.1500', '2K': '0.3000' }, { high: { '2K': '0.4000' } });
  expect(appPrice('image', [m], { modelIds: ['img'] })).toEqual({ label: 'img', usd: '0.1500' }); // no resolution: the first
  expect(appPrice('image', [m], { modelIds: ['img'], resolution: '2K' })).toEqual({ label: 'img', usd: '0.3000' });
  expect(appPrice('image', [m], { modelIds: ['img'], resolution: '2K', thinking: 'high' })).toEqual({ label: 'img', usd: '0.4000' });
  expect(appPrice('image', [m], { modelIds: ['img'], resolution: '4K' })).toBeNull();
});

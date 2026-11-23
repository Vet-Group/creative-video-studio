import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Clip } from '@/lib/api';
import { CompareButton } from './CompareItems';

const clip = (id: string, mediaType: Clip['mediaType']): Clip => ({
  id, creator: { id: 'u1', name: 'An' }, createdAt: '2026-11-14T00:00:00Z', modelId: 'm', modelLabel: 'Model', ratio: '9:16', durationSec: 5, feature: 'video', mediaType, resolution: null, isMock: false,
  videoAssetId: `a-${id}`, posterAssetId: null, storeId: null, storeName: null, costUsd: null, costFinal: true, verdict: null, favorite: false, example: false, productType: null, prompt: null, canEdit: false, mine: false, downloadName: 'out',
});
const button = (n: number) => renderToStaticMarkup(<CompareButton clips={Array.from({ length: n }, (_, i) => clip(`c${i}`, 'video'))} />);

test('So sánh is enabled for exactly two picked items and says why it is off otherwise', () => {
  expect(button(2)).toMatch(/<button type="button" title="Xem hai mục cạnh nhau">So sánh<\/button>/);
  for (const n of [1, 3]) expect(button(n)).toMatch(/<button type="button" disabled="" title="Chọn đúng 2 mục để so sánh">So sánh<\/button>/);
  expect(button(1)).not.toContain('<dialog');
});

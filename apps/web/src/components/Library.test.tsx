import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Clip } from '@/lib/api';
import { ClipDetail, emptyNoun } from './Library';

test('the empty Library names photos under a photo filter, clips under a video one, and results under a mixed one', () => {
  expect(['images', 'try_on', 'image'].map(emptyNoun)).toEqual(['ảnh', 'ảnh', 'ảnh']);
  expect(['videos', 'video', 'marketing', 'marketing_review'].map(emptyNoun)).toEqual(['clip', 'clip', 'clip', 'clip']);
  expect(['all', 'apps'].map(emptyNoun)).toEqual(['kết quả', 'kết quả']);
});

const clip = (mediaType: Clip['mediaType']): Clip => ({
  id: 'c1', creator: { id: 'u1', name: 'An' }, createdAt: '2026-11-14T00:00:00Z', modelId: 'm', modelLabel: 'Model', ratio: '9:16', durationSec: 5, feature: 'video', mediaType, resolution: null, isMock: false,
  videoAssetId: 'a1', posterAssetId: null, storeId: null, costUsd: '1.00', costFinal: true, verdict: null, favorite: false, example: false, prompt: null, canEdit: false, mine: false, downloadName: 'out',
});
const detail = (c: Clip) => renderToStaticMarkup(<ClipDetail clips={[c]} index={0} admin={false} onIndex={() => undefined} onChange={() => undefined} />);

test('the clip detail offers Nén & tải về on a video as well as on an image', () => {
  expect(detail(clip('video'))).toContain('aria-label="Nén &amp; tải về"');
  expect(detail(clip('image'))).toContain('aria-label="Nén &amp; tải về"');
});

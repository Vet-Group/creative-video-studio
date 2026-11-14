import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { Clip } from '@/lib/api';
import LibraryPage from '@/app/(app)/library/page';
import { filtersFromSearch } from '@/lib/library-view';
import { ClipCard, ClipDetail, clipLabel, emptyNoun, Library } from './Library';

test('the empty Library names photos under a photo filter, clips under a video one, and results under a mixed one', () => {
  expect(['images', 'try_on', 'image'].map(emptyNoun)).toEqual(['ảnh', 'ảnh', 'ảnh']);
  expect(['videos', 'video', 'marketing', 'marketing_review'].map(emptyNoun)).toEqual(['clip', 'clip', 'clip', 'clip']);
  expect(['all', 'apps'].map(emptyNoun)).toEqual(['kết quả', 'kết quả']);
});

// The page's refresh-on-news hook needs the app shell's provider, which a static render of the Library alone does not have.
vi.mock('./jobs', async (orig) => ({ ...(await orig<typeof import('./jobs')>()), useFreshResults: () => undefined }));

const clip = (mediaType: Clip['mediaType']): Clip => ({
  id: 'c1', creator: { id: 'u1', name: 'An' }, createdAt: '2026-11-14T00:00:00Z', modelId: 'm', modelLabel: 'Model', ratio: '9:16', durationSec: 5, feature: 'video', mediaType, resolution: null, isMock: false,
  videoAssetId: 'a1', posterAssetId: null, storeId: null, storeName: null, costUsd: '1.00', costFinal: true, verdict: null, favorite: false, example: false, prompt: null, canEdit: false, mine: false, downloadName: 'out',
});
const detail = (c: Clip) => renderToStaticMarkup(<ClipDetail clips={[c]} index={0} admin={false} onIndex={() => undefined} onChange={() => undefined} />);

test('the clip detail offers Nén & tải về on a video as well as on an image', () => {
  expect(detail(clip('video'))).toContain('aria-label="Nén &amp; tải về"');
  expect(detail(clip('image'))).toContain('aria-label="Nén &amp; tải về"');
});

const sample: Clip = {
  id: 'job-1', creator: { id: 'u1', name: 'Mai' }, createdAt: '2026-11-14T01:04:00.000Z', modelId: 'seedance', modelLabel: 'Seedance 1.5 Pro', ratio: '9:16', durationSec: 5,
  feature: 'video', mediaType: 'video', resolution: null, isMock: false, videoAssetId: 'vid-1', posterAssetId: 'poster-1', storeId: null, storeName: null, costUsd: '0.1000', costFinal: true,
  verdict: null, favorite: false, example: false, prompt: null, canEdit: true, mine: true, downloadName: '20261114-mai-job-1.mp4',
};
const card = (c: Clip, view: 'grid' | 'list' = 'grid') => renderToStaticMarkup(<ClipCard clip={c} view={view} onChange={() => undefined} onDeleted={() => undefined} onOpen={() => undefined} />);

test('a card is named by what was made, the model and the Vietnam time, not by its file name', () => {
  expect(clipLabel(sample)).toBe('Tạo video · Seedance 1.5 Pro · 08:04 14/11');
  for (const view of ['grid', 'list'] as const) expect(card(sample, view)).toContain('aria-label="Tạo video · Seedance 1.5 Pro · 08:04 14/11"');
  expect(card(sample)).not.toContain('Clip 20261114');
});

test("a video card shows the clip's own length once recorded, else the length asked", () => {
  expect(card({ ...sample, lengthSec: 3.7 })).toContain('>3.7s<');
  expect(card({ ...sample, lengthSec: null })).toContain('>5s<');
});

test('a grid video loads nothing until hover or focus: preload none with its poster, and metadata only when it has no poster', () => {
  const html = card(sample);
  expect(html).toContain('preload="none"');
  expect(html).toContain('poster="/api/assets/poster-1/thumb"');
  expect(card({ ...sample, posterAssetId: null })).toContain('preload="metadata"');
});

test('every action of a card is described by the card name, and the three marks are one tab stop', () => {
  const html = card(sample);
  const id = html.match(/<span id="([^"]+)" hidden="">Tạo video/)?.[1];
  expect(id).toBeTruthy();
  const labelled = (name: string) => html.match(new RegExp(`aria-describedby="${id}"[^>]*aria-label="${name}"|aria-label="${name}"[^>]*aria-describedby="${id}"`));
  for (const name of ['Yêu thích', 'Tải xuống', 'Xoá', 'Xem chi tiết']) expect(labelled(name), name).not.toBeNull();
  const marks = html.match(/<span class="verdict-buttons"[^>]*>(.*?)<\/span>/)![1]!;
  expect(marks.match(/<button/g)).toHaveLength(3);
  expect(marks.match(/aria-describedby="[^"]+"/g)).toHaveLength(3);
  expect(marks.match(/tabindex="0"/g)).toHaveLength(1);
  expect(marks.match(/tabindex="-1"/g)).toHaveLength(2);
});

test('a card and the detail name the store of an item that has one, and show nothing for one that has none', () => {
  const stored = { ...sample, storeName: 'Cửa hàng Đỏ' };
  for (const view of ['grid', 'list'] as const) {
    expect(card(stored, view)).toContain('Cửa hàng Đỏ');
    expect(card(sample, view)).not.toContain('Cửa hàng');
  }
  expect(detail(stored)).toContain('<dt>Cửa hàng</dt><dd>Cửa hàng Đỏ</dd>');
  expect(detail(sample)).not.toContain('<dt>Cửa hàng</dt>');
});

test('the filters of the address are what the server renders and the first client render starts from', async () => {
  const query = { q: 'áo dài', creator: 'u1', store: 'none', days: '7', ratio: '1:1', kind: 'videos', verdict: 'fail', favorites: '1', sort: 'oldest' };
  const html = renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve(query) }));
  expect(html).toBe(renderToStaticMarkup(<Library initialFilters={filtersFromSearch(query)} />));
  expect(html).toContain('value="áo dài"'); // the search box
  expect(html).toContain('<option value="oldest" selected="">'); // sort
  expect(html).toContain('<option value="none" selected="">Không gắn cửa hàng</option>'); // store
  expect(html).toContain('<option value="d7" selected="">'); // days
  expect(html).toContain('<option value="fail" selected="">'); // verdict
  expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Tất cả video</); // kind
  expect(html).toContain('aria-label="Chỉ mục yêu thích" checked=""'); // favourites
  for (const chip of ['Tìm: áo dài', 'Người tạo: u1', 'Cửa hàng: Không gắn cửa hàng', 'Tỉ lệ: 1:1']) expect(html, chip).toContain(chip);
});

test('without a query the Library renders no filter and a repeated key counts once', async () => {
  expect(renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve({}) }))).toBe(renderToStaticMarkup(<Library />));
  expect(filtersFromSearch({ kind: ['video', 'images'], days: undefined })).toMatchObject({ kind: 'video', days: '' });
});

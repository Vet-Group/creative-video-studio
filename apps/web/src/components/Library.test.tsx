import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { Clip } from '@/lib/api';
import LibraryPage from '@/app/(app)/library/page';
import { filtersFromSearch } from '@/lib/library-view';
import { ClipCard, ClipDetail, clipLabel, deleteConsequence, emptyNoun, gridStep, Library } from './Library';

test('the empty Library names photos under a photo filter, clips under a video one, and results under a mixed one', () => {
  expect(['images', 'try_on', 'image'].map(emptyNoun)).toEqual(['ảnh', 'ảnh', 'ảnh']);
  expect(['videos', 'video', 'marketing', 'marketing_review'].map(emptyNoun)).toEqual(['clip', 'clip', 'clip', 'clip']);
  expect(['all', 'apps'].map(emptyNoun)).toEqual(['kết quả', 'kết quả']);
});

// The page's refresh-on-news hook needs the app shell's provider, which a static render of the Library alone does not have.
vi.mock('./jobs', async (orig) => ({ ...(await orig<typeof import('./jobs')>()), useFreshResults: () => undefined }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) })); // the detail's Use this frame navigates; a static render has no app router

const clip = (mediaType: Clip['mediaType']): Clip => ({
  id: 'c1', creator: { id: 'u1', name: 'An' }, createdAt: '2026-11-14T00:00:00Z', modelId: 'm', modelLabel: 'Model', ratio: '9:16', durationSec: 5, feature: 'video', mediaType, resolution: null, isMock: false,
  videoAssetId: 'a1', posterAssetId: null, storeId: null, storeName: null, costUsd: '1.00', costFinal: true, verdict: null, favorite: false, example: false, productType: null, prompt: null, canEdit: false, mine: false, downloadName: 'out',
});
const detail = (c: Clip) => renderToStaticMarkup(<ClipDetail clips={[c]} index={0} admin={false} onIndex={() => undefined} onChange={() => undefined} />);

test('the clip detail offers Nén & tải về on a video as well as on an image', () => {
  expect(detail(clip('video'))).toContain('aria-label="Nén &amp; tải về"');
  expect(detail(clip('image'))).toContain('aria-label="Nén &amp; tải về"');
});

test("an image's detail opens the picture in the image tools (Xoá nền, Tăng độ phân giải, Đổi nền, Đổi khung hình), another member's too, except the tool that made it; never a video", () => {
  const tools = (c: Clip) => [...detail(c).matchAll(/<button type="button" class="lightbox-result">([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]*>/g, '').trim());
  const own: Clip = { ...clip('image'), feature: 'image', mine: true };
  expect(tools(own)).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình']);
  expect(tools({ ...own, mine: false })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình']);
  expect(tools({ ...own, feature: 'background_remover' })).toEqual(['Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình']);
  expect(tools({ ...own, feature: 'image_upscale' })).toEqual(['Xoá nền', 'Đổi nền', 'Đổi khung hình']);
  expect(tools({ ...own, feature: 'reframe' })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền']);
  expect(tools({ ...clip('video'), mine: true })).toEqual([]);
});

const sample: Clip = {
  id: 'job-1', creator: { id: 'u1', name: 'Mai' }, createdAt: '2026-11-14T01:04:00.000Z', modelId: 'seedance', modelLabel: 'Seedance 1.5 Pro', ratio: '9:16', durationSec: 5,
  feature: 'video', mediaType: 'video', resolution: null, isMock: false, videoAssetId: 'vid-1', posterAssetId: 'poster-1', storeId: null, storeName: null, costUsd: '0.1000', costFinal: true,
  verdict: null, favorite: false, example: false, productType: null, prompt: null, canEdit: true, mine: true, downloadName: '20261114-mai-job-1.mp4',
};
const card = (c: Clip, view: 'grid' | 'list' = 'grid') => renderToStaticMarkup(<ClipCard clip={c} view={view} onChange={() => undefined} onDeleted={() => undefined} onOpen={() => undefined} />);

test('a card is named by what was made, the model and the Vietnam time, not by its file name', () => {
  expect(clipLabel(sample)).toBe('Tạo video · Seedance 1.5 Pro · 08:04 14/11');
  for (const view of ['grid', 'list'] as const) expect(card(sample, view)).toContain('aria-label="Tạo video · Seedance 1.5 Pro · 08:04 14/11"');
  expect(card(sample)).not.toContain('Clip 20261114');
  // The model name line ends in an ellipsis when the card is narrow; its title keeps the whole name.
  expect(card(sample)).toContain('<p class="lib-title" title="Seedance 1.5 Pro">Seedance 1.5 Pro</p>');
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

// Three columns: the first row's tops are 0, the second row's 300, the last row (two cards) 600.
const tops = [0, 0, 0, 300, 300, 300, 600, 600];

test('arrow keys on the grid step one card, and Up and Down keep the column', () => {
  expect(gridStep(tops, 1, 'ArrowRight')).toBe(2);
  expect(gridStep(tops, 3, 'ArrowLeft')).toBe(2); // Left from a row start goes to the end of the row above
  expect(gridStep(tops, 1, 'ArrowDown')).toBe(4);
  expect(gridStep(tops, 5, 'ArrowUp')).toBe(2);
  expect(gridStep(tops, 5, 'ArrowDown')).toBe(7); // the last row is short: its last card
  expect(gridStep(tops, 6, 'ArrowUp')).toBe(3);
});

test('Home and End jump to the ends, and a key at an edge or one that is not an arrow does nothing', () => {
  expect(gridStep(tops, 4, 'Home')).toBe(0);
  expect(gridStep(tops, 4, 'End')).toBe(7);
  expect(gridStep(tops, 0, 'ArrowLeft')).toBe(0);
  expect(gridStep(tops, 7, 'ArrowRight')).toBe(7);
  expect(gridStep(tops, 1, 'ArrowUp')).toBeNull(); // no row above
  expect(gridStep(tops, 7, 'ArrowDown')).toBeNull(); // no row below
  expect(gridStep(tops, 1, 'Enter')).toBeNull();
  expect(gridStep(tops, -1, 'ArrowRight')).toBeNull();
});

test('the grid follows the rendered width: one column moves by one, and a day heading that pushes a card down starts a new row', () => {
  expect(gridStep([0, 100, 200], 1, 'ArrowDown')).toBe(2);
  expect(gridStep([0, 0, 40, 40], 1, 'ArrowDown')).toBe(3);
  expect(gridStep([0, 0.4, 0.6], 1, 'ArrowDown')).toBeNull(); // sub-pixel differences are one row
});

test('the delete confirm says the item leaves the Library now and is gone for good after 30 days, and names the Examples tab only for an example', () => {
  expect(deleteConsequence(false)).toBe('Nó biến khỏi Thư viện ngay, rồi bị xoá hẳn sau 30 ngày.');
  expect(deleteConsequence(true)).toBe('Nó biến khỏi Thư viện ngay và khỏi mục Ví dụ, rồi bị xoá hẳn sau 30 ngày.');
});

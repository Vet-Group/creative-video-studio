import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { Clip } from '@/lib/api';
import LibraryPage from '@/app/(app)/library/page';
import { filtersFromSearch } from '@/lib/library-view';
import { ClipCard, ClipDetail, clipLabel, emptyNoun, gridStep, Library, MakeAppLink, RecipeText, RepeatTiles } from './Library';
import { UndoNotice } from './UndoNotice';

test('the empty Library names photos under a photo filter, clips under a video one, and results under a mixed one', () => {
  expect(['images', 'try_on', 'image'].map(emptyNoun)).toEqual(['ảnh', 'ảnh', 'ảnh']);
  expect(['videos', 'video', 'marketing', 'marketing_review'].map(emptyNoun)).toEqual(['clip', 'clip', 'clip', 'clip']);
  expect(['all', 'apps'].map(emptyNoun)).toEqual(['kết quả', 'kết quả']);
});

// The page's refresh-on-news hook and the detail's toasts need the app shell's provider, which a static render of the Library alone does not have.
vi.mock('./jobs', async (orig) => ({ ...(await orig<typeof import('./jobs')>()), useFreshResults: () => undefined, useJobs: () => ({ notify: () => undefined }) }));
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

test('the clip detail offers Xem lặp on a picture only, off by default', () => {
  const html = detail(clip('image'));
  expect(html).toContain('role="group" aria-label="Xem lặp"');
  expect(html).toMatch(/aria-pressed="true">Tắt<\/button><button type="button" aria-pressed="false">2×2<\/button><button type="button" aria-pressed="false">3×3<\/button>/);
  expect(html).not.toContain('lightbox-tile');
  expect(html).toContain('<img');
  expect(detail(clip('video'))).not.toContain('Xem lặp');
});

test('Xem lặp tiles the picture 2×2 and 3×3 in its own ratio', () => {
  const two = renderToStaticMarkup(<RepeatTiles src="/p.jpg" label="out" tile={2} ratio="3:4" />);
  expect(two).toContain('aria-label="out, lặp 2×2"');
  expect(two).toContain('background-image:url(/p.jpg)');
  expect(two).toContain('background-size:calc(100% / 2) calc(100% / 2)');
  expect(two).toContain('aspect-ratio:0.75');
  const three = renderToStaticMarkup(<RepeatTiles src="/p.jpg" label="out" tile={3} ratio="x" />);
  expect(three).toContain('background-size:calc(100% / 3) calc(100% / 3)');
  expect(three).toContain('aspect-ratio:1');
});

test('a video’s detail offers Tải theo tỉ lệ khác: the three shapes and the two fills as pressed choices, 9:16 on a blurred fill first, then its download', () => {
  const html = detail(clip('video'));
  const group = html.match(/<div class="reframe" role="group" aria-labelledby="([^"]+)"><span id="\1">Tải theo tỉ lệ khác<\/span>([\s\S]*?Tải về)<\/button><\/div>/)?.[2] ?? '';
  const choices = (label: string) => [...(group.match(new RegExp(`aria-label="${label}">([\\s\\S]*?)</div>`))?.[1] ?? '').matchAll(/aria-pressed="(true|false)">([^<]+)</g)].map((m) => `${m[2]}${m[1] === 'true' ? '*' : ''}`);
  expect(choices('Tỉ lệ khung')).toEqual(['9:16*', '4:5', '1:1']);
  expect(choices('Nền')).toEqual(['Nền mờ*', 'Nền đen']);
  expect(group).toMatch(/<button type="button" class="icon-button labelled" aria-busy="false" title="Tải về theo tỉ lệ đã chọn">.*?Tải về$/);
  expect(detail(clip('image'))).not.toContain('class="reframe"'); // a picture has the image Reframe app among its tools instead
});

test('the clip detail names Download and Use this frame in words, and a video gets a first stop that skips its player', () => {
  const html = detail(clip('video'));
  expect(html).toMatch(/<button type="button" class="icon-button labelled" title="Tải xuống">.*?Tải xuống<\/button>/);
  expect(html).toMatch(/title="Dùng khung hình này làm ảnh cho Tạo video">.*?Dùng khung hình<\/button>/);
  expect(html.indexOf('Bỏ qua video')).toBeGreaterThan(-1);
  expect(html.indexOf('Bỏ qua video')).toBeLessThan(html.indexOf('<video'));
  expect(detail(clip('image'))).not.toContain('Bỏ qua video');
});

test('the marks and Reuse sit in the pinned footer, and Chạy lại is the quieter button with the price it last cost', () => {
  const own: Clip = { ...clip('video'), mine: true, canEdit: true };
  const foot = detail(own).match(/<div class="lightbox-foot">([\s\S]*)<\/div><\/div>/)?.[1] ?? '';
  expect(foot).toContain('class="verdict-buttons"');
  expect(foot).toContain('<button type="button" class="lightbox-reuse lightbox-rerun">Chạy lại · $1.00</button>');
  expect(foot).toMatch(/<a [^>]*href="\/create\?reuse=c1"[^>]*>Dùng lại<\/a>/);
  expect(detail({ ...own, costUsd: null })).toContain('>Chạy lại</button>');
  expect(detail({ ...own, mine: false })).not.toContain('Chạy lại');
});

test('a long recipe text shows its first lines and Xem thêm; a short one shows whole', () => {
  const long = renderToStaticMarkup(<RecipeText label="Mô tả" text={'một ý dài '.repeat(30)} />);
  expect(long).toContain('<p data-clamped="">');
  expect(long).toContain('aria-expanded="false">Xem thêm</button>');
  expect(renderToStaticMarkup(<RecipeText label="Mô tả" text={'dòng\n'.repeat(5)} />)).toContain('Xem thêm'); // five short lines are long too
  const short = renderToStaticMarkup(<RecipeText label="Mô tả" text="một câu ngắn" />);
  expect(short).toContain('<p>một câu ngắn</p>');
  expect(short).not.toContain('Xem thêm');
});

test("an image's detail opens the picture in the image tools (Xoá nền, Tăng độ phân giải, Đổi nền, Đổi khung hình, Sửa lại hình in), another member's too, except the tool that made it; a video only in the print fix, on its poster", () => {
  const tools = (c: Clip) => [...detail(c).matchAll(/<button type="button" class="lightbox-result">([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]*>/g, '').trim());
  const own: Clip = { ...clip('image'), feature: 'image', mine: true };
  expect(tools(own)).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình', 'Sửa lại hình in']);
  expect(tools({ ...own, mine: false })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình', 'Sửa lại hình in']);
  // A cutout's or an upscale's print is its source's, so neither offers the print fix; nor does the print fix's own result.
  expect(tools({ ...own, feature: 'background_remover' })).toEqual(['Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình']);
  expect(tools({ ...own, feature: 'image_upscale' })).toEqual(['Xoá nền', 'Đổi nền', 'Đổi khung hình']);
  expect(tools({ ...own, feature: 'reframe' })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Sửa lại hình in']);
  expect(tools({ ...own, feature: 'print_fix' })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình']);
  // The pose generator only on a person's result: an AI model's or a Try On's, not its own or any other; an AI model wears no seller's print.
  expect(tools({ ...own, feature: 'fashion_model' })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình', 'Đổi tư thế']);
  expect(tools({ ...own, feature: 'try_on' })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình', 'Đổi tư thế', 'Sửa lại hình in']);
  expect(tools({ ...own, feature: 'pose_generator' })).toEqual(['Xoá nền', 'Tăng độ phân giải', 'Đổi nền', 'Đổi khung hình', 'Sửa lại hình in']);
  expect(tools({ ...clip('video'), mine: true })).toEqual([]); // no poster yet
  expect(tools({ ...clip('video'), posterAssetId: 'p1' })).toEqual(['Sửa lại hình in']); // its first frame
  expect(detail({ ...clip('video'), feature: 'hook_effect', posterAssetId: 'p1' })).not.toContain('lightbox-tools'); // a hook effect's first frame is the effect's start: no tool, no empty row
});

const sample: Clip = {
  id: 'job-1', creator: { id: 'u1', name: 'Mai' }, createdAt: '2026-11-14T01:04:00.000Z', modelId: 'seedance', modelLabel: 'Seedance 1.5 Pro', ratio: '9:16', durationSec: 5,
  feature: 'video', mediaType: 'video', resolution: null, isMock: false, videoAssetId: 'vid-1', posterAssetId: 'poster-1', storeId: null, storeName: null, costUsd: '0.1000', costFinal: true,
  verdict: null, favorite: false, example: false, productType: null, prompt: null, canEdit: true, mine: true, downloadName: '20261114-mai-job-1.mp4',
};
const card = (c: Clip, view: 'grid' | 'list' = 'grid') => renderToStaticMarkup(<ClipCard clip={c} view={view} onChange={() => undefined} onDeleted={() => undefined} onOpen={() => undefined} />);

test("the first row's pictures load at once, the lead one first, and the rest lazily (the page's LCP)", () => {
  const image: Clip = { ...sample, mediaType: 'image', feature: 'image', posterAssetId: null };
  const img = (index?: number, lead?: boolean) =>
    renderToStaticMarkup(<ClipCard clip={image} view="grid" index={index} lead={lead} onChange={() => undefined} onDeleted={() => undefined} onOpen={() => undefined} />).match(/<img class="output"[^>]*>/)![0];
  expect(img(0, true)).toMatch(/ fetchpriority="high"/i); // React writes it fetchPriority; HTML attribute names ignore case
  expect(img(2, true)).toMatch(/ fetchpriority="high"/i); // the first picture after two videos
  for (const i of [0, 1, 3]) expect(img(i)).not.toContain('loading="lazy"');
  for (const i of [0, 1, 3, 4, 20]) expect(img(i)).not.toMatch(/fetchpriority/i);
  for (const i of [4, 20, undefined]) expect(img(i)).toContain('loading="lazy"');
});

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

test('with no board the Library renders no Bảng control, and a ?board= link renders the field and its chip', async () => {
  const html = renderToStaticMarkup(<Library />);
  expect(html).not.toContain('<span>Bảng</span>');
  expect(html).not.toContain('Bảng:');
  const opened = renderToStaticMarkup(<Library initialFilters={filtersFromSearch({ board: 'b1' })} />);
  expect(opened).toContain('<span>Bảng</span>'); // the field shows while the boards load, so the link's own filter is visible
  expect(opened).toMatch(/<span>Bảng<\/span><span aria-hidden="true">×<\/span>/); // the chip, which reads just the word until the boards are known
  expect(renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve({ board: 'b1' }) }))).toBe(opened);
});

test('the detail offers the Bảng button only to a page that passes the boards (the History and curated mounts do not)', () => {
  const boards = { boards: [{ id: 'b1', name: 'Tết 2027', count: 2 }], failed: false, reload: async () => undefined, create: async () => ({ id: 'b2', name: 'x', count: 0 }), rename: async () => undefined, remove: async () => undefined, setItems: async () => undefined };
  const withBoards = (c: Clip) => renderToStaticMarkup(<ClipDetail clips={[c]} index={0} admin={false} boards={boards} onIndex={() => undefined} onChange={() => undefined} />);
  expect(detail(sample)).not.toMatch(/>Bảng/);
  expect(withBoards(sample)).toMatch(/aria-haspopup="dialog">.*?Bảng<\/button>/);
  expect(withBoards({ ...sample, boardIds: ['b1'] })).toMatch(/aria-haspopup="dialog">.*?Bảng \(1\)<\/button>/);
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

test('a delete shows a Hoàn tác notice inside a live region that is there before the text, and the card has no confirm dialog', () => {
  expect(renderToStaticMarkup(<UndoNotice note={null} onClose={() => undefined} />)).toBe('<div class="undo-notice" role="status"></div>');
  const note = renderToStaticMarkup(<UndoNotice note={{ key: 'c1', text: 'Đã xoá clip.', undo: async () => undefined }} onClose={() => undefined} />);
  expect(note).toContain('role="status"');
  expect(note).toContain('Đã xoá clip.');
  expect(note).toMatch(/<button type="button">Hoàn tác<\/button>/);
  const card = renderToStaticMarkup(<ClipCard clip={{ ...clip('video'), canEdit: true }} view="grid" onChange={() => undefined} onDeleted={() => undefined} onOpen={() => undefined} />);
  expect(card).toContain('aria-label="Xoá"');
  expect(card).not.toContain('alertdialog');
});

test('Biến thành ứng dụng is a link to the editor for an eligible result, and nothing for one with a preset, a brand, no input or another feature', () => {
  const ok = { inputCount: 2, presetId: null, brand: false };
  const html = renderToStaticMarkup(<MakeAppLink clip={clip('video')} job={ok} />);
  expect(html).toMatch(/<a [^>]*href="\/admin\/apps\/new\?job=c1"[^>]*>Biến thành ứng dụng<\/a>/);
  expect(renderToStaticMarkup(<MakeAppLink clip={{ ...clip('image'), feature: 'image' }} job={ok} />)).toContain('Biến thành ứng dụng');
  for (const job of [{ ...ok, presetId: 'p1' }, { ...ok, brand: true }, { ...ok, inputCount: 0 }]) expect(renderToStaticMarkup(<MakeAppLink clip={clip('video')} job={job} />)).toBe('');
  expect(renderToStaticMarkup(<MakeAppLink clip={{ ...clip('video'), feature: 'try_on' }} job={ok} />)).toBe('');
});

test('the clip detail has no Biến thành ứng dụng unless the page asks for it, and then only once the job is read', () => {
  expect(detail(clip('video'))).not.toContain('Biến thành ứng dụng');
  const asked = renderToStaticMarkup(<ClipDetail clips={[clip('video')]} index={0} admin makeApp onIndex={() => undefined} onChange={() => undefined} />);
  expect(asked).not.toContain('Biến thành ứng dụng'); // the job has not been read in a static render
});

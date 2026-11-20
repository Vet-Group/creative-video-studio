import { expect, test } from 'vitest';
import { visibleApps } from './apps';
import { matchScore, type PaletteGroup, searchPalette } from './command-palette';
import { navGroups } from './sidebar';

const page = (name: string, description?: string) => ({ href: `/${name}`, name, description, icon: 'home' as const });

test('case and Vietnamese accents do not count: "thu vien" finds Thư viện, "tao video" Tạo video, "do" Đổi nền', () => {
  expect(matchScore('thu vien', page('Thư viện'))).toBe(3);
  expect(matchScore('THƯ VIỆN', page('Thư viện'))).toBe(3);
  expect(matchScore('tao video', page('Tạo video'))).toBe(3);
  expect(matchScore('doi nen', page('Đổi nền'))).toBe(3);
  expect(matchScore('Đổi', page('doi nen'))).toBe(3);
  expect(matchScore('try on', { name: 'Thử trang sức', keywords: 'jewelry try-on' })).toBe(2); // punctuation reads as a space
  expect(matchScore('thu vien', page('Tạo video'))).toBe(0);
  expect(matchScore('  ', page('Tạo video'))).toBe(1); // an empty query keeps everything
});

test('the name starting with the query ranks first, then a word that starts with it (in the name, description or keywords), then a match inside a word', () => {
  expect(matchScore('tao', page('Tạo ảnh'))).toBe(3);
  expect(matchScore('anh', page('Tạo ảnh'))).toBe(2);
  expect(matchScore('nen', page('Đổi nền'))).toBe(2);
  expect(matchScore('ghep', page('Khung', 'Ghép ảnh vào khung'))).toBe(2);
  expect(matchScore('swap', { name: 'Đổi nhân vật', keywords: 'character swap' })).toBe(2);
  expect(matchScore('ien', page('Thư viện'))).toBe(1);
  const groups: PaletteGroup[] = [{ label: 'Trang', items: [page('Khung', 'Đặt ảnh vào khung'), page('Tạo ảnh'), page('Ảnh nhiều góc'), page('Thư viện')] }];
  expect(searchPalette(groups, 'anh')[0]!.items.map((i) => i.name)).toEqual(['Ảnh nhiều góc', 'Khung', 'Tạo ảnh']); // ties keep their order
});

test('a group that matches nothing is left out, and the group with the best match comes first', () => {
  const groups: PaletteGroup[] = [
    { label: 'Trang', items: [page('Tạo ảnh'), page('Thư viện')] },
    { label: 'Ứng dụng', items: [page('Ảnh nhiều góc'), page('Đổi nền')] },
    { label: 'Lượt tạo gần đây', items: [page('Tạo video')] },
  ];
  expect(searchPalette(groups, 'anh').map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([['Ứng dụng', ['Ảnh nhiều góc']], ['Trang', ['Tạo ảnh']]]);
  expect(searchPalette(groups, 'tao').map((g) => g.label)).toEqual(['Trang', 'Lượt tạo gần đây']); // a tie keeps the given order
  expect(searchPalette(groups, '').map((g) => g.items.length)).toEqual([2, 2, 1]);
  expect(searchPalette(groups, 'xyz')).toEqual([]);
});

test('the real sidebar pages and apps: "thu vien" puts the Library first, and an app is found by its English keyword', () => {
  const groups: PaletteGroup[] = [
    { label: 'Trang', items: navGroups(false).flatMap((g) => g.items).map((p) => page(p.text, p.hint)).map((p, i) => ({ ...p, href: String(i) })) },
    { label: 'Ứng dụng', items: visibleApps(false).map((a) => ({ href: a.slug, name: a.name, description: a.description, keywords: a.keywords, icon: 'apps' as const })) },
  ];
  expect(searchPalette(groups, 'thu vien')[0]!.items[0]!.name).toBe('Thư viện');
  expect(searchPalette(groups, 'tao video')[0]!.items[0]!.name).toBe('Tạo video');
  expect(searchPalette(groups, 'upscale').flatMap((g) => g.items.map((i) => i.href))).toContain('image-upscale');
});

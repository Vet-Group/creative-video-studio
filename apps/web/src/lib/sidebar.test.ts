import { expect, test } from 'vitest';
import { filterApps } from './apps';
import { appShortcuts, isSettingsShortcut, navGroups } from './sidebar';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test('Ctrl+, opens Settings on Windows and Linux, Cmd+, on a Mac, and nothing else does', () => {
  expect(isSettingsShortcut(key(',', { ctrlKey: true }), false)).toBe(true);
  expect(isSettingsShortcut(key(',', { metaKey: true }), true)).toBe(true);
  expect(isSettingsShortcut(key(',', { metaKey: true }), false)).toBe(false);
  expect(isSettingsShortcut(key(',', { ctrlKey: true }), true)).toBe(false);
  expect(isSettingsShortcut(key(','), false)).toBe(false);
  expect(isSettingsShortcut(key('.', { ctrlKey: true }), false)).toBe(false);
  expect(isSettingsShortcut(key(',', { ctrlKey: true, shiftKey: true }), false)).toBe(false);
  expect(isSettingsShortcut(key(',', { ctrlKey: true, altKey: true }), false)).toBe(false);
});

test('the groups keep the order users know, and only an Admin gets the admin group, last', () => {
  const flat = (admin: boolean) => navGroups(admin).flatMap((g) => g.items.map((i) => i.text));
  expect(flat(false)).toEqual(['Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện', 'Góp ý', 'Có gì mới', 'Hướng dẫn']);
  expect(flat(true)).toEqual([...flat(false), 'Quản trị']);
  expect(navGroups(false).map((g) => g.label)).toEqual([null, 'Sáng tạo', 'Của bạn']);
  expect(navGroups(true).at(-1)!.label).toBe('Quản lý');
});

test("a partner workspace's owner gets the Members page in the management group, before an Admin's Quản trị", () => {
  const manage = (admin: boolean, members: boolean) => navGroups(admin, 0, false, members).find((g) => g.label === 'Quản lý')?.items.map((i) => i.href);
  expect(manage(false, false)).toBeUndefined();
  expect(manage(false, true)).toEqual(['/members']);
  expect(manage(true, true)).toEqual(['/members', '/admin/overview']);
});

test('the Phân tích item appears right after Tạo video only when the analysis feature is on', () => {
  const texts = (on: boolean) => navGroups(false, 0, on).flatMap((g) => g.items.map((i) => i.text));
  expect(texts(false)).not.toContain('Phân tích');
  const on = texts(true);
  expect(on).toContain('Phân tích');
  expect(on.indexOf('Phân tích')).toBe(on.indexOf('Tạo video') + 1);
});

test('the newest tool Phân tích carries the "Mới" badge, and Marketing Studio no longer does', () => {
  const items = navGroups(false, 0, true).flatMap((g) => g.items);
  expect(items.find((i) => i.href === '/analyze')?.badge).toBe('Mới');
  expect(items.find((i) => i.href === '/marketing-studio')?.badge).toBeUndefined();
});

test('the feedback item shows its count as a badge (new items for an Admin, updated ones for a member) and none at zero', () => {
  const feedback = (admin: boolean, count: number) => navGroups(admin, count).flatMap((g) => g.items).find((i) => i.href === '/feedback');
  expect(feedback(true, 3)?.badge).toBe('3');
  expect(feedback(true, 0)?.badge).toBeUndefined();
  expect(feedback(false, 2)?.badge).toBe('2');
  expect(feedback(false, 0)?.badge).toBeUndefined();
});

test('the Apps shortcuts are the five apps of the reference site, in its order, each an app the Apps index shows', () => {
  const slugs = appShortcuts(false).map((a) => a.slug);
  expect(slugs).toEqual(['jewelry-try-on', 'lingerie-try-on', 'ai-fashion-model', 'media-optimizer', 'background-changer']);
  expect(appShortcuts(true).map((a) => a.slug)).toEqual(slugs);
  expect(slugs.every((s) => filterApps('all', '', false).some((a) => a.slug === s))).toBe(true);
});

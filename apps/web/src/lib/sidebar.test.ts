import { expect, test } from 'vitest';
import { isSettingsShortcut, navGroups } from './sidebar';

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
  expect(flat(false)).toEqual(['Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện', 'Góp ý']);
  expect(flat(true)).toEqual([...flat(false), 'Quản trị']);
  expect(navGroups(false).map((g) => g.label)).toEqual([null, 'Sáng tạo', 'Của bạn']);
  expect(navGroups(true).at(-1)!.label).toBe('Quản lý');
});

test('the Phân tích item appears right after Tạo video only when the analysis feature is on', () => {
  const texts = (on: boolean) => navGroups(false, 0, on).flatMap((g) => g.items.map((i) => i.text));
  expect(texts(false)).not.toContain('Phân tích');
  const on = texts(true);
  expect(on).toContain('Phân tích');
  expect(on.indexOf('Phân tích')).toBe(on.indexOf('Tạo video') + 1);
});

test('an Admin sees the count of new feedback as a badge on the feedback item; a member never does', () => {
  const feedback = (admin: boolean, count: number) => navGroups(admin, count).flatMap((g) => g.items).find((i) => i.href === '/feedback');
  expect(feedback(true, 3)?.badge).toBe('3');
  expect(feedback(true, 0)?.badge).toBeUndefined();
  expect(feedback(false, 3)?.badge).toBeUndefined();
});

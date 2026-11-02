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
  expect(flat(false)).toEqual(['Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện']);
  expect(flat(true)).toEqual([...flat(false), 'Quản trị']);
  expect(navGroups(false).map((g) => g.label)).toEqual([null, 'Sáng tạo', 'Của bạn']);
  expect(navGroups(true).at(-1)!.label).toBe('Quản lý');
});

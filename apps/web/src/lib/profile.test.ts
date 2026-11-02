import { expect, test } from 'vitest';
import { AVATAR_COLORS, avatarColor, isAvatarColor, nameProblem, protection, userAvatarColor } from './profile';

test('only the palette colours, exactly as written, are avatar colours', () => {
  for (const c of AVATAR_COLORS) expect(isAvatarColor(c)).toBe(true);
  for (const v of ['#B91C1C', '#ff0000', 'red', '', null, undefined, 7, ['#b91c1c']]) expect(isAvatarColor(v)).toBe(false);
});

test('a picked colour wins over the one the name gives; without one the name decides', () => {
  expect(userAvatarColor('Nguyễn Văn An', '#0369a1')).toBe('#0369a1');
  expect(userAvatarColor('Nguyễn Văn An', null)).toBe(avatarColor('Nguyễn Văn An'));
});

test('a display name has 1 to 60 characters after trimming and no control characters', () => {
  expect(nameProblem('  Nguyễn Văn Ánh ')).toBeNull();
  expect(nameProblem('ẩ'.repeat(60))).toBeNull(); // characters, not UTF-16 units or bytes
  expect(nameProblem('   ')).toBe('Hãy nhập tên hiển thị.');
  expect(nameProblem('a'.repeat(61))).toBe('Tên hiển thị dài tối đa 60 ký tự.');
  for (const n of ['a\tb', 'a\nb', 'a\u0000', 'a\u007f', 'a\u009b']) expect(nameProblem(n)).toBe('Tên hiển thị có ký tự không hợp lệ.');
});

test('protection: password, passkey and 2FA; without a password a linked Google or Lark sign-in counts instead and 2FA does not apply', () => {
  const done = (a: Parameters<typeof protection>[0]) => protection(a).map((c) => [c.id, c.done]);
  expect(done({ hasPassword: true, linked: false, passkeys: 0, twoFactor: false })).toEqual([['password', true], ['passkey', false], ['twoFactor', false]]);
  expect(done({ hasPassword: true, linked: true, passkeys: 2, twoFactor: true })).toEqual([['password', true], ['passkey', true], ['twoFactor', true]]);
  expect(done({ hasPassword: false, linked: true, passkeys: 0, twoFactor: false })).toEqual([['linked', true], ['passkey', false]]);
  expect(done({ hasPassword: false, linked: false, passkeys: 1, twoFactor: false })).toEqual([['linked', false], ['passkey', true]]);
});

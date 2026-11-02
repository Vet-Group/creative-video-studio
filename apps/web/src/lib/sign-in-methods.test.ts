import { expect, test } from 'vitest';
import { methodText } from './sign-in-methods';

test('a passkey reads with the day it was added, so two passkeys of one user tell apart', () => {
  expect(methodText({ id: 'a', provider: 'passkey', email: null, createdAt: '2026-11-01T18:30:00Z' })).toBe('Passkey · 02/11/2026');
  expect(methodText({ id: 'b', provider: 'google', email: 'x@example.com' })).toBe('Google (x@example.com)');
  expect(methodText({ id: 'c', provider: 'credential', email: null })).toBe('Email và mật khẩu');
});

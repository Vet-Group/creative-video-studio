import { expect, test } from 'vitest';
import { loginFor, returnTo } from './return-to';

test('a page of this site is kept with its query and hash', () => {
  expect(returnTo('/library?tab=video#x')).toBe('/library?tab=video#x');
  expect(returnTo('/admin/users')).toBe('/admin/users');
});

test('anything that could leave the site, or loop back to the login, falls back to Create', () => {
  for (const next of [undefined, '', 'library', 'https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/..//evil.example', '/.//evil.example', '/%2e%2e//evil.example', '/x/..//evil.example', '//[', '/login', '/login?next=/x', ['/library']]) {
    expect(returnTo(next), String(next)).toBe('/create');
  }
});

test('the login URL carries the page to come back to, and only a real one', () => {
  expect(loginFor('/library?tab=video')).toBe('/login?next=%2Flibrary%3Ftab%3Dvideo');
  expect(loginFor('/create')).toBe('/login');
  expect(loginFor(null)).toBe('/login');
  expect(loginFor('//evil.example')).toBe('/login');
});

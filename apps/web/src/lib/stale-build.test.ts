import { expect, test } from 'vitest';
import { isStaleBuild } from './stale-build';

test("a chunk the browser cannot fetch after a deploy is a stale build; any other page error is not", () => {
  expect(isStaleBuild({ name: 'ChunkLoadError', message: 'Loading chunk 123 failed.' })).toBe(true);
  expect(isStaleBuild({ name: 'Error', message: 'Loading CSS chunk 7 failed.' })).toBe(true);
  expect(isStaleBuild({ name: 'TypeError', message: 'Failed to fetch dynamically imported module: /_next/static/chunks/a.js' })).toBe(true);
  expect(isStaleBuild({ name: 'Error', message: 'Failed to load chunk /_next/static/chunks/b.js' })).toBe(true);
  expect(isStaleBuild({ name: 'TypeError', message: "Cannot read properties of undefined (reading 'id')" })).toBe(false);
  expect(isStaleBuild({ name: 'Error', message: 'Không tải được thư viện' })).toBe(false);
});

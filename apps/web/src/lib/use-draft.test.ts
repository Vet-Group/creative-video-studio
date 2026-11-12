import { afterEach, expect, test, vi } from 'vitest';
import { readDraft, writeDraft } from './use-draft';

afterEach(() => vi.unstubAllGlobals());

test('a draft is kept per key, an empty text removes it, and blocked storage is no error', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  writeDraft('video.free', 'a red bottle');
  writeDraft('try-on', 'a linen dress');
  expect(readDraft('video.free')).toBe('a red bottle');
  expect(readDraft('try-on')).toBe('a linen dress');
  expect(readDraft('image')).toBe('');
  writeDraft('video.free', '');
  expect(readDraft('video.free')).toBe('');
  expect(readDraft('try-on')).toBe('a linen dress');

  const blocked = () => {
    throw new Error('SecurityError');
  };
  vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
  expect(() => writeDraft('video.free', 'x')).not.toThrow();
  expect(readDraft('video.free')).toBe('');
});

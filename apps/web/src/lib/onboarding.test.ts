import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HINTS_KEY, resetOnboarding, WELCOME_KEY, WIZARD_KEY } from './onboarding';

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('clears every first-run guide key and leaves others', () => {
  store.set(WELCOME_KEY, '1');
  store.set(HINTS_KEY, '["/create"]');
  store.set(WIZARD_KEY, '0');
  store.set('cvs.other', 'keep');
  resetOnboarding();
  expect(store.has(WELCOME_KEY)).toBe(false);
  expect(store.has(HINTS_KEY)).toBe(false);
  expect(store.has(WIZARD_KEY)).toBe(false);
  expect(store.get('cvs.other')).toBe('keep');
});

test('does not throw when storage is unavailable', () => {
  vi.stubGlobal('localStorage', {
    removeItem: () => {
      throw new Error('blocked');
    },
  });
  expect(() => resetOnboarding()).not.toThrow();
});

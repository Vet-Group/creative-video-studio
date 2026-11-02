import { beforeEach, expect, test, vi } from 'vitest';
import { readTheme, saveTheme, THEME_KEY, THEME_SCRIPT, themeOf } from './theme';

let store: Map<string, string>;
let html: { dataset: Record<string, string> };

beforeEach(() => {
  store = new Map();
  html = { dataset: {} };
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal('document', { documentElement: html });
});

/** Runs the head script against the stubbed storage and returns the data-theme it leaves on <html>. */
const headScript = (): string | undefined => {
  new Function(THEME_SCRIPT)();
  return html.dataset.theme;
};

test('a stored light or dark choice is the theme, and the head script puts it on <html>', () => {
  for (const t of ['light', 'dark'] as const) {
    store.set(THEME_KEY, t);
    html.dataset = {};
    expect(readTheme()).toBe(t);
    expect(headScript()).toBe(t);
  }
});

test('nothing stored or an unknown value follows the system: no data-theme', () => {
  for (const v of [null, '', 'system', 'Dark', 'blue']) {
    expect(themeOf(v)).toBe('system');
    store.clear();
    if (v !== null) store.set(THEME_KEY, v);
    html.dataset = {};
    expect(readTheme()).toBe('system');
    expect(headScript()).toBeUndefined();
  }
});

test('blocked storage reads as the system theme, and neither the script nor saving throws', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
  expect(readTheme()).toBe('system');
  expect(headScript()).toBeUndefined();
  saveTheme('dark');
  expect(html.dataset.theme).toBe('dark'); // still applied to this page
});

test('saving applies the choice at once; the system choice clears the attribute and the stored value', () => {
  saveTheme('dark');
  expect(html.dataset.theme).toBe('dark');
  expect(store.get(THEME_KEY)).toBe('dark');
  saveTheme('light');
  expect(html.dataset.theme).toBe('light');
  saveTheme('system');
  expect(html.dataset.theme).toBeUndefined();
  expect(store.has(THEME_KEY)).toBe(false);
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { announce, readPref, writePref } from './preferences';

let store: Map<string, string>;
const shown: unknown[][] = [];
let tones = 0;

beforeEach(() => {
  store = new Map();
  shown.length = 0;
  tones = 0;
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal('document', { visibilityState: 'hidden' });
  vi.stubGlobal(
    'Notification',
    class {
      static permission = 'granted';
      constructor(...args: unknown[]) {
        shown.push(args);
      }
    },
  );
  const param = { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined };
  vi.stubGlobal(
    'AudioContext',
    class {
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      createGain = () => ({ gain: param, connect: (n: unknown) => n });
      createOscillator = () => ({ frequency: param, connect: (n: unknown) => n, start: () => void tones++, stop: () => undefined });
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

test('preferences are off until switched on, and are stored per device', () => {
  expect([readPref('notify'), readPref('chime')]).toEqual([false, false]);
  writePref('notify', true);
  expect([readPref('notify'), readPref('chime')]).toEqual([true, false]);
  writePref('notify', false);
  expect(readPref('notify')).toBe(false);
});

test('blocked storage reads as off and a write does not throw', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
  expect(() => writePref('chime', true)).not.toThrow();
  expect(readPref('chime')).toBe(false);
});

test('a finished job notifies only when switched on, the tab is hidden and the page may notify; the chime has its own switch', () => {
  announce(['Clip đã xong']);
  expect([shown.length, tones]).toEqual([0, 0]);

  writePref('notify', true);
  announce(['Clip đã xong']);
  expect(shown).toEqual([['Creative Video Studio', { body: 'Clip đã xong', tag: 'cvs-jobs' }]]);
  announce(['Ảnh đã xong', 'Clip đã xong']);
  expect(shown[1]).toEqual(['Creative Video Studio', { body: '2 job đã xong', tag: 'cvs-jobs' }]);

  vi.stubGlobal('document', { visibilityState: 'visible' });
  announce(['Clip đã xong']);
  expect(shown).toHaveLength(2); // the toast says it in a tab the user is looking at

  vi.stubGlobal('document', { visibilityState: 'hidden' });
  (Notification as unknown as { permission: string }).permission = 'denied';
  announce(['Clip đã xong']);
  expect([shown.length, tones]).toEqual([2, 0]);

  writePref('chime', true);
  announce(['Clip đã xong']);
  expect(tones).toBe(1);
  announce([]);
  expect(tones).toBe(1);
});

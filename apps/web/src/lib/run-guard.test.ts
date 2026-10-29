import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmRun, runKey } from './run-guard';

afterEach(() => vi.unstubAllGlobals());

describe('confirmRun', () => {
  it('asks only from 1 USD, with the price in the question, and returns the answer', () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('window', { confirm });
    expect(confirmRun('0.9999')).toBe(true);
    expect(confirmRun(undefined)).toBe(true);
    expect(confirmRun(null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(confirmRun('1.0000')).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith('Chạy job này với giá $1.0000?');
    confirm.mockReturnValue(true);
    expect(confirmRun(1.5, 'Tạo 2 clip?')).toBe(true);
    expect(confirm).toHaveBeenLastCalledWith('Tạo 2 clip?');
  });
});

describe('runKey', () => {
  const key = (o: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; repeat: boolean; isComposing: boolean }>) => {
    const preventDefault = vi.fn();
    return { e: { key: 'Enter', ctrlKey: false, metaKey: false, repeat: false, ...o, nativeEvent: { isComposing: o.isComposing ?? false }, preventDefault }, preventDefault };
  };
  it('runs on Ctrl+Enter and Cmd+Enter only, not on a repeat or while composing', () => {
    const go = vi.fn();
    const handler = runKey(go);
    for (const o of [{ ctrlKey: true }, { metaKey: true }]) {
      const { e, preventDefault } = key(o);
      handler(e);
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    expect(go).toHaveBeenCalledTimes(2);
    for (const o of [{}, { ctrlKey: true, key: 'a' }, { ctrlKey: true, repeat: true }, { ctrlKey: true, isComposing: true }]) {
      const { e, preventDefault } = key(o);
      handler(e);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    expect(go).toHaveBeenCalledTimes(2);
  });
});

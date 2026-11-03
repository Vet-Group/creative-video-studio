import { describe, expect, it, vi } from 'vitest';
import { confirmDialog } from '@/components/Confirm';
import { confirmRun, runKey } from './run-guard';

vi.mock('@/components/Confirm', () => ({ confirmDialog: vi.fn() }));

describe('confirmRun', () => {
  it('asks only from 1 USD, with the price in the question, and returns the answer', async () => {
    const confirm = vi.mocked(confirmDialog).mockResolvedValue(false);
    expect(await confirmRun('0.9999')).toBe(true);
    expect(await confirmRun(undefined)).toBe(true);
    expect(await confirmRun(null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(await confirmRun('1.0000')).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith({ title: 'Chạy job này với giá $1.0000?', confirmLabel: 'Tiếp tục' });
    confirm.mockResolvedValue(true);
    expect(await confirmRun(1.5, 'Tạo 2 clip?')).toBe(true);
    expect(confirm).toHaveBeenLastCalledWith({ title: 'Tạo 2 clip?', confirmLabel: 'Tiếp tục' });
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

import { describe, expect, it, vi } from 'vitest';
import { confirmDialog } from '@/components/Confirm';
import { ApiError } from '@/lib/api';
import { confirmRerun, confirmRun, runKey } from './run-guard';

vi.mock('@/components/Confirm', () => ({ confirmDialog: vi.fn() }));

describe('confirmRun', () => {
  it('asks only from 1 USD, with the price in the question, and returns the answer', async () => {
    const confirm = vi.mocked(confirmDialog).mockResolvedValue(false);
    expect(await confirmRun('0.9999')).toBe(true);
    expect(await confirmRun(undefined)).toBe(true);
    expect(await confirmRun(null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(await confirmRun('1.0000')).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith({ title: 'Tạo lượt này với giá $1.0000?', confirmLabel: 'Tiếp tục' });
    confirm.mockResolvedValue(true);
    expect(await confirmRun(1.5, 'Tạo 2 clip?')).toBe(true);
    expect(confirm).toHaveBeenLastCalledWith({ title: 'Tạo 2 clip?', confirmLabel: 'Tiếp tục' });
  });
});

describe('confirmRerun', () => {
  const ask = (usd: string | null | undefined) => `Chạy lại $${usd}?`;
  it('sends the price shown, and asks again about the server price when it is higher, sending that one', async () => {
    const confirm = vi.mocked(confirmDialog).mockReset().mockResolvedValue(true);
    const send = vi.fn().mockRejectedValueOnce(new ApiError(409, 'price', null, null, '2.0000')).mockResolvedValue({});
    expect(await confirmRerun('0.8000', ask, send)).toBe(true);
    expect(send.mock.calls).toEqual([[0.8], [2]]);
    expect(confirm).toHaveBeenCalledOnce(); // $0.80 needed no question, the new $2.00 did
    expect(confirm).toHaveBeenLastCalledWith({ title: 'Chạy lại $2.0000?', confirmLabel: 'Tiếp tục' });
  });
  it('stops when the member declines the new price, and passes any other failure on', async () => {
    vi.mocked(confirmDialog).mockReset().mockResolvedValue(false);
    const send = vi.fn().mockRejectedValueOnce(new ApiError(409, 'price', null, null, '2.0000'));
    expect(await confirmRerun('0.8000', ask, send)).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    await expect(confirmRerun('0.8000', ask, vi.fn().mockRejectedValue(new ApiError(409, 'assets deleted')))).rejects.toThrow('assets deleted');
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

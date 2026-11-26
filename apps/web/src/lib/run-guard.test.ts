import { describe, expect, it, vi } from 'vitest';
import { confirmDialog } from '@/components/Confirm';
import { api, ApiError } from '@/lib/api';
import { confirmRerun, confirmRun, runKey, sendRun, usd } from './run-guard';

vi.mock('@/components/Confirm', () => ({ confirmDialog: vi.fn() }));
vi.mock('@/lib/api', async (actual) => ({ ...(await actual<typeof import('@/lib/api')>()), api: vi.fn() }));

describe('usd', () => {
  it('shows cents with thousands separators from a dollar up, and under a dollar up to 4 decimals with no trailing zeros', () => {
    expect([usd('0.7000'), usd(0.134), usd('0.0000'), usd(1.206), usd('99841.8080'), usd('-0.1161')]).toEqual(['$0.70', '$0.134', '$0.00', '$1.21', '$99,841.81', '-$0.1161']);
    expect([usd('0.0035'), usd(0.005), usd('-0.0012')]).toEqual(['$0.0035', '$0.005', '-$0.0012']);
  });
});

describe('confirmRun', () => {
  it('asks only from 1 USD, with the price in the question, and returns the answer', async () => {
    const confirm = vi.mocked(confirmDialog).mockResolvedValue(false);
    expect(await confirmRun('0.9999')).toBe(true);
    expect(await confirmRun(undefined)).toBe(true);
    expect(await confirmRun(null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(await confirmRun('1.0000')).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith({ title: 'Tạo lượt này với giá $1.00?', confirmLabel: 'Tiếp tục' });
    confirm.mockResolvedValue(true);
    expect(await confirmRun(1.5, 'Tạo 2 clip?')).toBe(true);
    expect(confirm).toHaveBeenLastCalledWith({ title: 'Tạo 2 clip?', confirmLabel: 'Tiếp tục' });
  });
});

describe('sendRun', () => {
  it('sends a Run, and asks before sending the same body again for the same feature; a no sends nothing', async () => {
    const confirm = vi.mocked(confirmDialog).mockReset().mockResolvedValue(false);
    const send = vi.mocked(api).mockReset().mockResolvedValue({});
    const body = { feature: 'image', modelId: 'm', prompt: 'a red shirt' };
    expect(await sendRun(body)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(await sendRun({ ...body })).toBe(false); // the same settings again: asked, declined, not sent
    expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Chạy lại đúng các cài đặt vừa gửi?', confirmLabel: 'Chạy lại' }));
    expect(send).toHaveBeenCalledOnce();
    confirm.mockResolvedValue(true);
    expect(await sendRun(body)).toBe(true); // said yes: sent
    expect(send).toHaveBeenCalledTimes(2);
    confirm.mockClear();
    expect(await sendRun({ ...body, prompt: 'a blue shirt' })).toBe(true); // other settings, or another feature, are not asked about
    expect(await sendRun({ modelId: 'm', prompt: 'a blue shirt' })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("asks about a batch Run sent again, whose batch id is new each time", async () => {
    const confirm = vi.mocked(confirmDialog).mockReset().mockResolvedValue(false);
    vi.mocked(api).mockReset().mockResolvedValue({});
    const body = { feature: 'background_remover', modelId: 'm', assetIds: ['a'] };
    expect(await sendRun({ ...body, params: { resolution: '1K', batch: '7d0e2f54-3c55-4a0e-9a59-2f3f0c8b1a11' } })).toBe(true);
    expect(await sendRun({ ...body, params: { resolution: '1K', batch: '7d0e2f54-3c55-4a0e-9a59-2f3f0c8b1a12' } })).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });
  it('remembers only a Run the server took', async () => {
    const confirm = vi.mocked(confirmDialog).mockReset().mockResolvedValue(true);
    vi.mocked(api).mockReset().mockRejectedValueOnce(new ApiError(500, 'down')).mockResolvedValue({});
    const body = { feature: 'try_on', modelId: 'm' };
    await expect(sendRun(body)).rejects.toThrow('down');
    expect(await sendRun(body)).toBe(true); // the failed one does not count as sent
    expect(confirm).not.toHaveBeenCalled();
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

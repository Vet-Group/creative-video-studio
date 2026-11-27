import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { toAppConfig } from '@/lib/custom-apps';
import type { AppPrice } from '@/lib/use-app-price';
import { CustomAppForm } from './CustomAppForm';
import { JobsProvider } from './jobs';

const state = vi.hoisted(() => ({ price: { loading: false, failed: false, row: { label: 'Mock E2E', usd: '0.7000' } } as AppPrice }));
vi.mock('@/lib/use-app-price', () => ({ useAppPrice: () => state.price }));
vi.mock('@/lib/use-samples', async (orig) => ({ ...(await orig<typeof import('@/lib/use-samples')>()), useSamples: () => new Set<string>(), samplesPending: () => false }));
beforeEach(() => {
  state.price = { loading: false, failed: false, row: { label: 'Mock E2E', usd: '0.7000' } };
});

const row = { id: '0b5e1c7a-5c41-4c0e-9d6e-3c3f1a2b4d5e', feature: 'video', name: 'Video xoay sản phẩm', description: 'Xoay sản phẩm 360 độ', category: 'video', aspect: '9:16', durationS: 5, params: {}, inputs: [{ fixed: 'f1' }, { slot: { label: 'Ảnh sản phẩm', hint: 'Ảnh trên nền trắng' } }], publishedAt: new Date('2026-11-27T00:00:00Z'), outputAssetId: 'out-1', posterAssetId: null };
const render = () =>
  renderToStaticMarkup(
    <JobsProvider userId="u1">
      <CustomAppForm app={toAppConfig(row, ['m'])} />
    </JobsProvider>,
  );

test('the form has a slot for each upload, the app\'s own settings and its price, and no History tab, prompt or fixed photo', () => {
  const html = render();
  expect(html).toContain('Ảnh sản phẩm');
  expect(html).toContain('Ảnh trên nền trắng');
  expect(html).toContain('Cài sẵn: Mock E2E · 9:16 · 5 giây');
  expect(html).toContain('· $0.70');
  expect(html).toContain('Xoay sản phẩm 360 độ');
  expect(html).not.toContain('Lịch sử');
  expect(html).not.toMatch(/<textarea|f1/);
});

test('Run says what stops it: the price loading, the model off, the empty slot', () => {
  state.price = { loading: true, failed: false, row: null };
  expect(render()).toContain('Đang tải giá...');
  state.price = { loading: false, failed: false, row: null };
  expect(render()).toContain('Mô hình của ứng dụng này đang tắt. Báo Admin để sửa.');
  state.price = { loading: false, failed: true, row: null };
  expect(render()).toContain('Không tải được danh sách mô hình.');
  expect(render()).toMatch(/<button[^>]*disabled[^>]*>Chạy/);
  state.price = { loading: false, failed: false, row: { label: 'Mock E2E', usd: '0.7000' } };
  expect(render()).toContain('Tải lên ảnh: Ảnh sản phẩm.');
});

test('an image app shows its resolution instead of seconds', () => {
  const html = renderToStaticMarkup(
    <JobsProvider userId="u1">
      <CustomAppForm app={toAppConfig({ ...row, feature: 'image', durationS: 0, params: { resolution: '2K' } }, ['m'])} />
    </JobsProvider>,
  );
  expect(html).toContain('Cài sẵn: Mock E2E · 9:16 · 2K');
});

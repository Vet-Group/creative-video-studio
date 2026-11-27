import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { AdminAppRow } from '@/lib/custom-apps-db';
import { AdminApps } from './AdminApps';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) })); // a static render has no app router

const row = (over: Partial<AdminAppRow>): AdminAppRow => ({ id: 'a1', name: 'Video xoay', category: 'video', published: false, sourceLive: true, ...over });

test('an empty list says how to make the first app', () => {
  const html = renderToStaticMarkup(<AdminApps rows={[]} />);
  expect(html).toContain('Ứng dụng tự tạo');
  expect(html).toContain('Chưa có ứng dụng nào.');
  expect(html).toContain('Mở một kết quả trong Thư viện rồi bấm Biến thành ứng dụng.');
});

test('a row is a draft, published, or has lost its source clip, with the actions that fit', () => {
  const draft = renderToStaticMarkup(<AdminApps rows={[row({})]} />);
  expect(draft).toContain('Nháp');
  expect(draft).toContain('>Video<'); // the category label
  expect(draft).toContain('>Đăng lên trang Ứng dụng<');
  expect(draft).toContain('href="/admin/apps/a1"');
  expect(draft).toContain('href="/apps/a1"');
  expect(draft).toContain('>Xoá ứng dụng<');

  const live = renderToStaticMarkup(<AdminApps rows={[row({ published: true })]} />);
  expect(live).toContain('Đã đăng');
  expect(live).toContain('>Gỡ khỏi trang Ứng dụng<');

  const dead = renderToStaticMarkup(<AdminApps rows={[row({ published: true, sourceLive: false })]} />);
  expect(dead).toContain('Kết quả gốc đã bị xoá');
  expect(dead).toContain('>Gỡ khỏi trang Ứng dụng<');
  expect(dead).not.toContain('href="/admin/apps/a1"'); // nothing to edit or open
  expect(dead).not.toContain('href="/apps/a1"');
  expect(dead).toContain('>Xoá ứng dụng<');
  const deadDraft = renderToStaticMarkup(<AdminApps rows={[row({ sourceLive: false })]} />);
  expect(deadDraft).not.toContain('Đăng lên trang Ứng dụng');
});

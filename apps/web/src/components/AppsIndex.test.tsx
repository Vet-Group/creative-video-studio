import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { APPS } from '@/lib/apps';
import { toAppConfig } from '@/lib/custom-apps';
import { AppsIndex } from './AppsIndex';

vi.mock('@/lib/use-samples', async (orig) => ({ ...(await orig<typeof import('@/lib/use-samples')>()), useSamples: () => new Set<string>(), samplesPending: () => false }));

const row = { id: '0b5e1c7a-5c41-4c0e-9d6e-3c3f1a2b4d5e', feature: 'video', name: 'Video xoay sản phẩm', description: 'Xoay sản phẩm 360 độ', category: 'video', aspect: '9:16', durationS: 5, params: {}, inputs: [{ slot: { label: 'Ảnh 1', hint: '' } }], publishedAt: new Date('2026-11-27T00:00:00Z'), outputAssetId: 'out-1', posterAssetId: 'poster-1' };

test('without custom apps the index lists only the built-in apps', () => {
  const html = renderToStaticMarkup(<AppsIndex />);
  expect(html).not.toContain('/apps/0b5e1c7a');
  expect(html.match(/class="app-card"/g)).toHaveLength(APPS.length - 1); // Smart Remake is off
});

test('a custom app is a card after the built-in apps, linking to its id with the art of its source result', () => {
  const html = renderToStaticMarkup(<AppsIndex extra={[toAppConfig(row, ['m'])]} />);
  const cards = html.match(/href="\/apps\/[^"]+"/g)!;
  expect(cards.at(-1)).toBe(`href="/apps/${row.id}"`);
  expect(html).toContain('Video xoay sản phẩm');
  expect(html).toContain('Xoay sản phẩm 360 độ');
  expect(html).toContain('src="/api/assets/out-1/content"');
  expect(html, 'it sits past the first rows, so its poster stays lazy (#671)').not.toContain('poster-1');
  expect(html.indexOf('/apps/breed-swap')).toBeLessThan(html.indexOf(`/apps/${row.id}`));
});

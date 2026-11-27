import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { appBySlug } from '@/lib/apps';
import { toAppConfig } from '@/lib/custom-apps';
import { AppArt } from './AppPage';

const samples = vi.hoisted(() => ({ pending: true, have: new Set<string>() }));
vi.mock('@/lib/use-samples', async (orig) => ({ ...(await orig<typeof import('@/lib/use-samples')>()), useSamples: () => samples.have, samplesPending: () => samples.pending }));

const app = appBySlug('breed-swap')!;
beforeEach(() => Object.assign(samples, { pending: true, have: new Set<string>() }));

test("an app's page keeps the art's box while the sample list loads, so the About text below does not jump down when the art arrives", () => {
  const html = renderToStaticMarkup(<AppArt app={app} page />);
  expect(html).toContain('class="app-art"');
  expect(html).toContain('data-page="true"');
  expect(html, 'an empty box, not the category icon that would flash before the art').not.toContain('<svg');
});

test('once the list is in, the page shows the art, or nothing for an app without art', () => {
  samples.pending = false;
  expect(renderToStaticMarkup(<AppArt app={app} page />)).toBe('');
  samples.have = new Set(['app-breed-swap.jpg']);
  expect(renderToStaticMarkup(<AppArt app={app} page />)).toContain('/api/samples/app-breed-swap.jpg');
});

test('a card without art keeps its tinted tile with the category icon, loading or not', () => {
  for (const pending of [true, false]) {
    samples.pending = pending;
    expect(renderToStaticMarkup(<AppArt app={app} />)).toContain('<svg');
  }
});

test("a custom app's card shows its source result, an uploaded sample of the same name wins, and an image app shows its still", () => {
  samples.pending = false;
  const row = { id: 'c1', feature: 'video', name: 'N', description: '', category: 'video', aspect: '9:16', durationS: 5, params: {}, inputs: [], publishedAt: null, outputAssetId: 'out-1', posterAssetId: 'poster-1' };
  const custom = toAppConfig(row, ['m']);
  const html = renderToStaticMarkup(<AppArt app={custom} lazy />);
  expect(html).toContain('src="/api/assets/out-1/content"');
  expect(html).toContain('<video');
  expect(html, 'the lazy card keeps its poster back until it nears the view').not.toContain('poster=');
  samples.have = new Set(['app-c1.jpg']);
  expect(renderToStaticMarkup(<AppArt app={custom} />)).toContain('/api/samples/app-c1.jpg');
  samples.have = new Set();
  const still = renderToStaticMarkup(<AppArt app={toAppConfig({ ...row, feature: 'image', durationS: 0, posterAssetId: null }, ['m'])} />);
  expect(still).toContain('/api/assets/out-1/thumb');
  expect(still).not.toContain('<video');
});

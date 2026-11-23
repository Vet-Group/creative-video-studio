import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { appBySlug } from '@/lib/apps';
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

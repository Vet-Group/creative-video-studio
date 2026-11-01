import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('@/lib/model-scores', () => ({ modelStats: vi.fn(async () => new Map()), rank: () => ({}), scoreOf: () => ({ score: 0 }) }));
vi.mock('@/lib/samples', () => ({ listSamples: vi.fn(async () => []) }));
vi.mock('@/components/CardMedia', () => ({ CardMedia: ({ poster, video }: { poster: string; video: string }) => <img src={poster} data-video={video} alt="" /> }));

import { pool } from '@/lib/auth';
import { listSamples } from '@/lib/samples';
import ExplorePage from './page';

beforeEach(() => vi.mocked(listSamples).mockResolvedValue([]));

function card(html: string, href: string) {
  return html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`))![1]!;
}

test('Apps and Library use distinct existing local artwork without uploaded samples', async () => {
  const html = renderToStaticMarkup(await ExplorePage());
  const posters = ['/apps', '/library'].map((href) => card(html, href).match(/src="([^"]+)"/)![1]!);
  expect(new Set(posters).size).toBe(2);
  for (const poster of posters) {
    expect(poster).toMatch(/^\/artwork\/explore-.*\.svg$/);
    expect(readFileSync(new URL(`../../../../public${poster}`, import.meta.url), 'utf8')).toContain('<svg');
  }
});

test('uploaded Apps and Library posters and loops override local artwork', async () => {
  vi.mocked(listSamples).mockResolvedValue(['feature-apps.jpg', 'feature-apps.mp4', 'feature-library.jpg', 'feature-library.mp4'].map((name) => ({ name })) as Awaited<ReturnType<typeof listSamples>>);
  const html = renderToStaticMarkup(await ExplorePage());
  for (const name of ['apps', 'library']) {
    const markup = card(html, `/${name}`);
    expect(markup).toContain(`src="/api/samples/feature-${name}.jpg"`);
    expect(markup).toContain(`data-video="/api/samples/feature-${name}.mp4"`);
  }
});

test('a model variant without its own sample shows the sample of the model it varies', async () => {
  const ids = ['seedance-2.0-replicate', 'minimax-h3-max-reference-1080p', 'seedance-2.0-reference', 'kling-2.6'];
  const rows = ids.map((id) => ({ id, label: id, provider: 'fal', kind: 'video', ratios: ['9:16'], durations_sec: [5], usd_per_second: '0.1', image_prices: null }));
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  vi.mocked(listSamples).mockResolvedValue(['model-seedance-2-0.mp4', 'model-seedance-2-0.jpg', 'model-minimax-h3-max.jpg', 'model-seedance-2-0-reference.jpg'].map((name) => ({ name })) as Awaited<ReturnType<typeof listSamples>>);
  const html = renderToStaticMarkup(await ExplorePage());
  const model = (id: string) => card(html, `/create\\?model=${id}`);
  expect(model('seedance-2.0-replicate')).toContain('data-video="/api/samples/model-seedance-2-0.mp4"');
  expect(model('minimax-h3-max-reference-1080p')).toContain('src="/api/samples/model-minimax-h3-max.jpg"');
  expect(model('seedance-2.0-reference')).toContain('src="/api/samples/model-seedance-2-0-reference.jpg"'); // its own sample wins
  expect(model('kling-2.6')).not.toContain('src=');
});

test('Seedance 2.5 and the Replicate Seedance 2.0 keep their featured places when the -image and base rows are off', async () => {
  const ids = ['flux-3', 'seedance-2.0-replicate', 'kling-o3-pro', 'seedance-2.5'];
  const rows = ids.map((id) => ({ id, label: id, provider: 'fal', kind: 'video', ratios: ['9:16'], durations_sec: [5], usd_per_second: '0.1', image_prices: null }));
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  vi.mocked(listSamples).mockResolvedValue(['model-flux-3.mp4'].map((name) => ({ name })) as Awaited<ReturnType<typeof listSamples>>);
  const html = renderToStaticMarkup(await ExplorePage());
  const order = [...html.matchAll(/href="\/create\?model=([^"]+)"/g)].map((m) => m[1]);
  expect(order).toEqual(['seedance-2.5', 'kling-o3-pro', 'seedance-2.0-replicate', 'flux-3']);
  expect(html).toMatch(/model=seedance-2\.0-replicate"[^<]*<img[^>]*><strong>[^<]*<\/strong><span[^>]*>Thế hệ video mới/); // a description, not the spec line
});

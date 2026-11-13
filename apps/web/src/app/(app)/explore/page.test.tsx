import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('@/lib/model-scores', () => ({ modelStats: vi.fn(async () => new Map()), rank: () => ({}), scoreOf: () => ({ score: 0 }) }));
vi.mock('@/lib/samples', () => ({ listSamples: vi.fn(async () => []) }));
vi.mock('@/lib/clips', () => ({ bestClips: vi.fn(async () => new Map()) }));
vi.mock('@/lib/current-user', () => ({ currentUser: vi.fn(async () => ({ mustChangePassword: false })) }));
vi.mock('@cvs/core/limits', () => ({ dailyClips: vi.fn(async () => ({ today: 2, cap: 5 })) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`); }) }));
vi.mock('@/components/CardMedia', () => ({ CardMedia: ({ poster, video }: { poster: string; video: string }) => <img src={poster} data-video={video} alt="" /> }));

import { pool } from '@/lib/auth';
import { bestClips } from '@/lib/clips';
import { currentUser } from '@/lib/current-user';
import { listSamples } from '@/lib/samples';
import ExplorePage from './page';

const props = (models?: string) => ({ searchParams: Promise.resolve({ models }) });

beforeEach(() => vi.mocked(listSamples).mockResolvedValue([]));

function card(html: string, href: string) {
  html = html.replace(/<section[^>]*class="explore-start"[\s\S]*?<\/section>/, ''); // the start list links the same tools, without artwork
  return html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`))![1]!;
}

test('Apps and Library use distinct existing local artwork without uploaded samples', async () => {
  const html = renderToStaticMarkup(await ExplorePage(props()));
  const posters = ['/apps', '/library'].map((href) => card(html, href).match(/src="([^"]+)"/)![1]!);
  expect(new Set(posters).size).toBe(2);
  for (const poster of posters) {
    expect(poster).toMatch(/^\/artwork\/explore-.*\.svg$/);
    expect(readFileSync(new URL(`../../../../public${poster}`, import.meta.url), 'utf8')).toContain('<svg');
  }
});

test('uploaded Apps and Library posters and loops override local artwork', async () => {
  vi.mocked(listSamples).mockResolvedValue(['feature-apps.jpg', 'feature-apps.mp4', 'feature-library.jpg', 'feature-library.mp4'].map((name) => ({ name })) as Awaited<ReturnType<typeof listSamples>>);
  const html = renderToStaticMarkup(await ExplorePage(props()));
  for (const name of ['apps', 'library']) {
    const markup = card(html, `/${name}`);
    expect(markup).toContain(`src="/api/samples/feature-${name}.jpg"`);
    expect(markup).toContain(`data-video="/api/samples/feature-${name}.mp4"`);
  }
});

test('a model variant without its own sample shows the sample of the model it varies', async () => {
  const ids = ['seedance-2.0-byteplus', 'minimax-h3-max-reference-1080p', 'seedance-2.0-reference', 'kling-2.6'];
  const rows = ids.map((id) => ({ id, label: id, provider: 'fal', kind: 'video', ratios: ['9:16'], durations_sec: [5], usd_per_second: '0.1', image_prices: null }));
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  vi.mocked(listSamples).mockResolvedValue(['model-seedance-2-0.mp4', 'model-seedance-2-0.jpg', 'model-minimax-h3-max.jpg', 'model-seedance-2-0-reference.jpg'].map((name) => ({ name })) as Awaited<ReturnType<typeof listSamples>>);
  const html = renderToStaticMarkup(await ExplorePage(props()));
  const model = (id: string) => card(html, `/create\\?model=${id}`);
  expect(model('seedance-2.0-byteplus')).toContain('data-video="/api/samples/model-seedance-2-0.mp4"');
  expect(model('minimax-h3-max-reference-1080p')).toContain('src="/api/samples/model-minimax-h3-max.jpg"');
  expect(model('seedance-2.0-reference')).toContain('src="/api/samples/model-seedance-2-0-reference.jpg"'); // its own sample wins
  expect(model('kling-2.6')).not.toContain('src=');
});

test('Seedance 2.5 and the BytePlus Seedance 2.0 keep their featured places when the -image and base rows are off', async () => {
  const ids = ['flux-3', 'seedance-2.0-byteplus', 'kling-o3-pro', 'seedance-2.5'];
  const rows = ids.map((id) => ({ id, label: id, provider: 'fal', kind: 'video', ratios: ['9:16'], durations_sec: [5], usd_per_second: '0.1', image_prices: null }));
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  vi.mocked(listSamples).mockResolvedValue(['model-flux-3.mp4'].map((name) => ({ name })) as Awaited<ReturnType<typeof listSamples>>);
  const html = renderToStaticMarkup(await ExplorePage(props()));
  const order = [...html.matchAll(/href="\/create\?model=([^"]+)"/g)].map((m) => m[1]);
  expect(order).toEqual(['seedance-2.5', 'kling-o3-pro', 'seedance-2.0-byteplus', 'flux-3']);
  expect(html).toMatch(/model=seedance-2\.0-byteplus"[^<]*<img[^>]*><strong>[^<]*<\/strong><span[^>]*>Thế hệ video mới/); // a description, not the spec line
});

test("a model's best Library clip replaces its sample, and a model with a clip but no sample moves up to the loops", async () => {
  const ids = ['kling-2.6', 'veo-3.1', 'flux-3'];
  const rows = ids.map((id) => ({ id, label: id, provider: 'fal', kind: 'video', ratios: ['9:16'], durations_sec: [5], usd_per_second: '0.1', image_prices: null }));
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  vi.mocked(listSamples).mockResolvedValue(['model-veo-3-1.mp4', 'model-veo-3-1.jpg', 'model-kling-2-6.jpg', 'model-flux-3.jpg'].map((name) => ({ name })) as Awaited<ReturnType<typeof listSamples>>);
  vi.mocked(bestClips).mockResolvedValueOnce(new Map([['veo-3.1', { video: '/api/assets/v/content', poster: '/api/assets/p/content' }], ['flux-3', { video: '/api/assets/f/content', poster: null }]]));
  const html = renderToStaticMarkup(await ExplorePage(props()));
  const model = (id: string) => card(html, `/create\\?model=${id}`);
  expect(model('veo-3.1')).toContain('data-video="/api/assets/v/content"');
  expect(model('veo-3.1')).toContain('src="/api/assets/p/content"');
  expect(model('kling-2.6')).toContain('src="/api/samples/model-kling-2-6.jpg"'); // no clip: the sample stays
  expect(model('flux-3')).toContain('src="/api/samples/model-flux-3.jpg"'); // a clip without a poster keeps the sample still
  expect(model('flux-3')).toContain('data-video="/api/assets/f/content"');
  expect([...html.matchAll(/href="\/create\?model=([^"]+)"/g)].map((m) => m[1])).toEqual(['veo-3.1', 'flux-3', 'kling-2.6']);
});

test('a user who must change an Admin-set password is sent to the change page, as the layout does not rerun on a client navigation', async () => {
  vi.mocked(currentUser).mockResolvedValueOnce({ mustChangePassword: true } as Awaited<ReturnType<typeof currentUser>>);
  vi.mocked(pool.query).mockClear();
  await expect(ExplorePage(props())).rejects.toThrow('redirect /account/password');
  expect(pool.query).not.toHaveBeenCalled();
});

/** The page's markup with these recent jobs (newest first) for a signed-in Phạm Quốc Hưng at 14:00 in Vietnam. */
async function withJobs(jobs: Record<string, unknown>[]) {
  vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));
  vi.mocked(currentUser).mockResolvedValueOnce({ id: 'u1', name: 'Phạm Quốc Hưng', mustChangePassword: false } as Awaited<ReturnType<typeof currentUser>>);
  vi.mocked(pool.query).mockImplementation((async (sql: string) => ({ rows: sql.includes('from jobs') ? jobs : [] })) as never);
  try {
    return renderToStaticMarkup(await ExplorePage(props()));
  } finally {
    vi.mocked(pool.query).mockImplementation((async () => ({ rows: [] })) as never);
    vi.useRealTimers();
  }
}
const job = (id: string, status: string, more: Record<string, unknown> = {}) => ({
  id, status, feature: 'video', poster_asset_id: null, output_asset_id: null, input_id: null, resolution: null, finished_at: null, created_at: new Date('2026-11-02T06:00:00Z'), ...more,
});

test('the hero greets the member by given name for the time of day in Vietnam, with their clips left today', async () => {
  const html = await withJobs([]);
  expect(html).toMatch(/<h1>Chào buổi chiều, Hưng<\/h1>/);
  expect(html).toContain('Hôm nay bạn còn 3/5 clip video');
  expect(html).not.toContain('đang chạy');
  expect(html).not.toContain('Tiếp tục'); // no jobs: the first-run line instead
  expect(html).toContain('Bạn chưa tạo clip hay ảnh nào');
});

test('a clip cap from 100,000 up is no cap, so the hero counts the clips made today instead of the clips left', async () => {
  const { dailyClips } = await import('@cvs/core/limits');
  vi.mocked(dailyClips).mockResolvedValueOnce({ today: 2, cap: 100_000 } as never);
  const html = await withJobs([]);
  expect(html).toContain('Hôm nay bạn đã tạo 2 clip video');
  expect(html).not.toContain('100000');
});

test('Continue shows running jobs first, then the latest finished, at most four; a finished one opens in the Library, the others on their page', async () => {
  const html = await withJobs([
    job('done-1', 'succeeded', { poster_asset_id: 'p1', output_asset_id: 'o1' }),
    job('img-1', 'succeeded', { feature: 'image', resolution: '1K', output_asset_id: 'i1' }),
    job('run-1', 'running', { feature: 'try_on', input_id: 'in1' }),
    job('bad-1', 'failed', { feature: 'marketing' }),
    job('done-2', 'succeeded'),
  ]);
  expect(html).toContain('1 lượt tạo đang chạy · Hôm nay bạn còn 3/5 clip video');
  expect(html).not.toContain('Bạn chưa tạo clip hay ảnh nào');
  const list = html.match(/<ul class="explore-jobs"[^>]*>([\s\S]*?)<\/ul>/)![1]!;
  const attr = (tag: string, name: string) => tag.match(new RegExp(` ${name}="([^"]+)"`))?.[1] ?? null;
  const cards = [...list.matchAll(/(<a [^>]*>)([\s\S]*?)<\/a>/g)].map(([, tag, inner]) => [attr(tag!, 'href'), attr(tag!, 'data-status'), attr(inner!, 'src')]);
  expect(cards).toEqual([
    ['/try-on', 'running', '/api/assets/in1/thumb'], // a running job shows the photo it was given
    ['/library?item=done-1', 'succeeded', '/api/assets/p1/thumb'], // a clip shows its poster
    ['/library?item=img-1', 'succeeded', '/api/assets/i1/thumb'], // an image shows itself
    ['/marketing-studio', 'failed', null],
  ]);
  expect(list).toContain('Đang tạo');
  expect(list).toContain('Không thành công');
});

test("Continue shows a finished image job's preview when it has one, else the image itself", async () => {
  const html = await withJobs([
    job('img-new', 'succeeded', { feature: 'image', resolution: '2K', output_asset_id: 'big', poster_asset_id: 'small' }),
    job('img-old', 'succeeded', { feature: 'try_on', resolution: '1K', output_asset_id: 'old' }),
  ]);
  const list = html.match(/<ul class="explore-jobs"[^>]*>([\s\S]*?)<\/ul>/)![1]!;
  expect([...list.matchAll(/ src="([^"]+)"/g)].map((m) => m[1])).toEqual(['/api/assets/small/thumb', '/api/assets/old/thumb']);
});

const modelRows = (n: number, kind: 'video' | 'image') =>
  Array.from({ length: n }, (_, i) => ({ id: `${kind}-${i}`, label: `${kind} ${i}`, provider: 'fal', kind, ratios: ['9:16'], durations_sec: [5], usd_per_second: '0.1', image_prices: kind === 'image' ? { '1K': '0.03' } : null }));
const modelLinks = (html: string) => [...html.matchAll(/href="\/(?:create|image-generation)\?model=([^"]+)"/g)].map((m) => m[1]);

test('the models row shows 7 video and 3 image models with a link to all of them, and ?models=all lists every one', async () => {
  const rows = [...modelRows(9, 'video'), ...modelRows(5, 'image')];
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  const featured = renderToStaticMarkup(await ExplorePage(props()));
  expect(modelLinks(featured)).toEqual([...rows.slice(0, 7), ...rows.slice(9, 12)].map((r) => r.id));
  expect(featured).toContain('Mô hình nổi bật');
  expect(featured).toContain('href="/explore?models=all#models"');
  expect(featured).toContain('Xem tất cả 14 mô hình');
  expect(featured).not.toContain('explore-cards-all');

  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  const all = renderToStaticMarkup(await ExplorePage(props('all')));
  expect(modelLinks(all)).toHaveLength(14);
  expect(all).toContain('Tất cả mô hình');
  expect(all).toContain('explore-cards explore-cards-all');
  expect(all).toContain('Chỉ xem nổi bật');
});

test('a model card shows its score only once it rests on at least three marks', async () => {
  const { modelStats } = await import('@/lib/model-scores');
  const rows = modelRows(2, 'video').map((r, i) => ({ ...r, id: `plain-${i}`, label: `Plain ${i}` }));
  const stats = new Map([['plain-0', { passes: 2, total: 2, ok: 0, bad: 0 }], ['plain-1', { passes: 3, total: 3, ok: 0, bad: 0 }]]);
  vi.mocked(modelStats).mockResolvedValueOnce(stats).mockResolvedValueOnce(new Map());
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  const html = renderToStaticMarkup(await ExplorePage(props('all')));
  expect(html).not.toContain('2 lượt đánh giá');
  expect(html).toContain('Điểm 0/100 · 3 lượt đánh giá');
});

test('a -vertex or -byteplus twin shows its model written description, not the spec line', async () => {
  const rows = ['gemini-omni-flash-vertex', 'seedream-5-pro-byteplus'].map((id) => ({ ...modelRows(1, id.startsWith('seedream') ? 'image' : 'video')[0]!, id }));
  vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);
  const html = renderToStaticMarkup(await ExplorePage(props()));
  expect(html).toContain('Mô hình video nhanh của Google');
  expect(html).toContain('Mô hình của ByteDance cho người và khung cảnh chân thực');
  expect(html).not.toContain('Điểm 0/100');
});

test('a Continue card names its model and, when the member wrote it, their prompt, so two jobs of one tool tell apart', async () => {
  const html = await withJobs([
    job('vid-1', 'succeeded', { model_label: 'Kling O3 Pro', prompt: 'a slow turn of the red mug' }),
    job('mkt-1', 'succeeded', { feature: 'marketing', model_label: 'Seedance 2.0', prompt: null }),
  ]);
  const list = html.match(/<ul class="explore-jobs"[^>]*>([\s\S]*?)<\/ul>/)![1]!;
  const cards = [...list.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map(([, inner]) => inner!);
  expect(cards[0]).toContain('<span class="explore-job-model">Kling O3 Pro</span>');
  expect(cards[0]).toMatch(/<span class="explore-job-prompt" title="a slow turn of the red mug">a slow turn of the red mug<\/span>/);
  expect(cards[1]).toContain('<span class="explore-job-model">Seedance 2.0</span>');
  expect(cards[1]).not.toContain('explore-job-prompt'); // a composed prompt is not shown
});

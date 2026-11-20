import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { openTab, signIn } from './support.test';

// A running History card shows its first input photo blurred, a thin bar and the usual time; when the result arrives it unblurs in and the bar is gone.
// The job list is answered by the spec, so the job stays running until the spec lets it finish.
const ratio = '9:16';
const photo = () =>
  sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="720" height="1280" fill="url(#g)"/><circle cx="360" cy="460" r="170" fill="#fff" fill-opacity=".85"/><rect x="190" y="680" width="340" height="360" rx="40" fill="#fff" fill-opacity=".7"/></svg>'))
    .jpeg()
    .toBuffer();

async function holdRunning(page: Page) {
  await signIn(page, 'runprog');
  const up = await page.request.post('/api/assets', { multipart: { file: { name: 'wait.jpg', mimeType: 'image/jpeg', buffer: await photo() } } });
  const asset = ((await up.json()) as { assets: { id: string }[] }).assets[0]!.id;
  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const base = { error: null, failureReason: null, isMock: false, feature: 'image', ratio, durationSec: 0, resolution: '2K', modelId: 'mock-image-e2e', retryOf: null, retried: false, posterAssetId: null, text: 'a slow pan over the shirt', inputAssetIds: [asset], garments: null, format: null, favorite: false, estimateUsd: '0.5000' };
  // Three earlier runs of the same model, 2 minutes each, give the usual time.
  const past = [1, 2, 3].map((n) => ({ ...base, id: `past-${n}`, status: 'succeeded', outputAssetId: asset, createdAt: iso(-n * 3_600_000), startedAt: iso(-n * 3_600_000), finishedAt: iso(-n * 3_600_000 + 120_000) }));
  let finished = false;
  let reads = 0;
  const current = () => ({ ...base, id: 'waiting-job-1', status: finished ? 'succeeded' : 'running', outputAssetId: finished ? asset : null, createdAt: iso(-40_000), startedAt: iso(-40_000), finishedAt: finished ? iso(0) : null });
  await page.route(/\/api\/jobs\?mine/, (r) => (reads++, r.fulfill({ json: { workerOffline: false, clips: { today: 0, cap: 20 }, jobs: [current(), ...past] } })));
  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  return { card: page.locator('.job-card').filter({ hasText: 'a slow pan over the shirt' }).first(), finish: () => (finished = true), reads: () => reads };
}

const box = async (media: Locator) => (await media.boundingBox())!;

for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`on ${name} a running card shows its blurred input, the usual time and a bar, and the result unblurs in with no layout shift`, async ({ page }) => {
    await page.setViewportSize(size);
    const { card, finish } = await holdRunning(page);
    const waiting = card.locator('.job-media-wait');
    await expect(waiting).toBeVisible();
    await expect(waiting.locator('.job-wait-input')).toHaveAttribute('src', /\/api\/assets\/[0-9a-f-]+\/thumb/);
    await expect(waiting.locator('.job-wait-input')).toHaveCSS('filter', /blur/);
    await expect(waiting.getByText('Thường mất khoảng 2 phút')).toBeVisible();
    const fraction = async () => card.locator('.job-wait-bar > span').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    // 40 s of a usual 2 minutes: well on the way, never full.
    await expect.poll(fraction).toBeGreaterThan(0.2);
    expect(await fraction()).toBeLessThan(0.9);
    const before = await box(card.locator('.job-media'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    finish();
    const result = card.locator('.job-media img:not(.job-wait-input)');
    await expect(result).toHaveCSS('opacity', '1', { timeout: 20_000 });
    await expect(result).toHaveCSS('filter', 'none');
    await expect(card.locator('.job-wait-bar')).toHaveCount(0);
    await expect(card.locator('.job-media-wait')).toHaveCount(0);
    const after = await box(card.locator('.job-media'));
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a running card has no serious accessibility problem (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: scheme });
    const { card } = await holdRunning(page);
    await expect(card.getByText('Thường mất khoảng 2 phút')).toBeVisible();
    const serious = (await new AxeBuilder({ page }).exclude('nextjs-portal').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => v.id)).toEqual([]);
  });
}

test('while a job runs the tray reads the list every 5 s, so its result shows up promptly', async ({ page }) => {
  const { card, reads } = await holdRunning(page);
  await expect(card.locator('.job-media-wait')).toBeVisible();
  const start = reads();
  await expect.poll(reads, { timeout: 12_000 }).toBeGreaterThanOrEqual(start + 2); // an idle tray reads once in 30 s
});

test('under reduced motion the result simply shows and the bar does not animate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { card, finish } = await holdRunning(page);
  await expect(card.locator('.job-wait-bar > span')).toHaveCSS('transition-duration', '0s');
  finish();
  await expect(card.locator('.job-media img:not(.job-wait-input)')).toHaveCSS('opacity', '1', { timeout: 20_000 });
  await expect(card.locator('.job-media img:not(.job-wait-input)')).toHaveCSS('transition-duration', '0s');
});

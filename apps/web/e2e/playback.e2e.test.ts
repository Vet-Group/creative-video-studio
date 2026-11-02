// Motion parity (docs/UI-MOTION-PARITY.md, acceptance 3): the Examples clips really play from real video files, and the playback rules hold.
// A poster is never evidence of motion, so these specs read currentTime and decoded frames from the video elements.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { EXAMPLES } from '../src/lib/examples';
import { modelButton, select, signIn } from './support.test';

const CLIPS = EXAMPLES.length;

async function openExamples(page: Page, size = { width: 1440, height: 1400 }): Promise<Locator> {
  await page.setViewportSize(size);
  await signIn(page, 'member6');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  const videos = page.locator('.masonry video');
  await expect(videos).toHaveCount(CLIPS);
  return videos;
}

const playing = (videos: Locator) => videos.evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length);
/** The clips at least a quarter on screen, the share Preview waits for before it plays. */
const inView = (videos: Locator) =>
  videos.evaluateAll((vs) =>
    vs.filter((v) => {
      const r = v.getBoundingClientRect();
      return r.height > 0 && (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height >= 0.25;
    }).length,
  );
const frames = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames);
const evidence = (what: string, data: Record<string, unknown>) => console.info(`[playback] ${what} ${JSON.stringify(data)}`);

test('C1: example clips load from valid sources and move: readyState, currentTime and decoded frames advance', async ({ page }) => {
  const sources: { url: string; status: number }[] = [];
  page.on('response', (r) => r.url().includes('/fixtures/examples/') && r.url().endsWith('.mp4') && sources.push({ url: new URL(r.url()).pathname, status: r.status() }));
  const videos = await openExamples(page);
  const first = videos.first();

  await expect.poll(() => first.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  expect(await first.evaluate((v: HTMLVideoElement) => v.error)).toBeNull();
  const f0 = await frames(first);
  await expect.poll(() => first.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await expect.poll(() => frames(first)).toBeGreaterThan(f0 + 5);

  const t = await first.evaluate((v: HTMLVideoElement) => ({ readyState: v.readyState, currentTime: v.currentTime, paused: v.paused, muted: v.muted, loop: v.loop, frames: v.getVideoPlaybackQuality().totalVideoFrames }));
  expect(t.muted && t.loop && !t.paused).toBe(true);
  evidence('first clip moves', { ...t, framesBefore: f0, sources: sources.length });
  expect(sources.length).toBeGreaterThan(0);
  expect(sources.every((s) => s.status === 200 || s.status === 206)).toBe(true);
});

test('every example on screen plays at once, as on the reference site', async ({ page }) => {
  const videos = await openExamples(page);
  const shown = await inView(videos);
  expect(shown).toBeGreaterThan(4); // more than the old cap of 4
  await expect.poll(() => playing(videos)).toBe(shown);
  evidence('all visible play', { clips: CLIPS, shown });
});

test('a clip scrolled out of view pauses and plays again when it returns', async ({ page }) => {
  const videos = await openExamples(page, { width: 1440, height: 400 });
  const first = videos.first();
  await expect.poll(() => first.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const box = (await first.boundingBox())!;
  expect(box.y + box.height).toBeLessThan(0); // the clip is fully off screen
  await expect.poll(() => first.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  evidence('off-screen pause', { bottom: Math.round(box.y + box.height), paused: true });

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => first.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
});

test('a hidden tab pauses every clip and a shown tab resumes them', async ({ page }) => {
  const videos = await openExamples(page);
  const shown = await inView(videos);
  await expect.poll(() => playing(videos)).toBe(shown);
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  await setVisibility('hidden');
  await expect.poll(() => playing(videos)).toBe(0);
  await setVisibility('visible');
  await expect.poll(() => playing(videos)).toBe(shown);
});

test('C2: a broken source keeps a poster-sized placeholder, not a gap', async ({ page }) => {
  // The first tile is on screen at once, so its broken source is hit at once.
  await page.route('**/fixtures/examples/example-1.mp4', (r) => r.fulfill({ status: 404, body: 'gone' }));
  const videos = await openExamples(page);
  const placeholder = page.getByRole('img', { name: /Tiến gần nhẹ nhàng: không tải được video/ });
  await expect(placeholder).toBeVisible();
  const box = (await placeholder.boundingBox())!;
  expect(box.width).toBeGreaterThan(50);
  expect(Math.abs(box.width / box.height - 180 / 320)).toBeLessThan(0.02); // the clip's own aspect ratio
  // The others still play.
  await expect.poll(() => playing(videos)).toBeGreaterThan(0);
  evidence('broken source', { width: box.width, height: box.height });
});

test('with reduced motion the examples still autoplay, as on the reference site, with no play buttons', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const videos = await openExamples(page);
  await expect.poll(() => videos.first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  expect(await playing(videos)).toBe(await inView(videos));
  await expect(page.getByRole('button', { name: /^Phát / })).toHaveCount(0);
});

test('C2: when the browser blocks autoplay each clip shows a play button, and pressing it plays', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let allowed = false;
    document.addEventListener('click', (e) => e.target instanceof Element && e.target.closest('.preview-play') && (allowed = true), true);
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      return allowed ? play.call(this) : Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    };
  });
  const videos = await openExamples(page);
  const buttons = page.getByRole('button', { name: /^Phát / });
  await expect(buttons).toHaveCount(CLIPS);
  expect(await playing(videos)).toBe(0);

  await buttons.first().click();
  await expect.poll(() => videos.first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
});

test('the preset banner keeps looping when another preset swaps its clip in place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member6');
  await page.goto('/create?preset=gentle-push-in'); // the free prompt has no clip of its own here
  await expect(page.locator('.banner')).toHaveAttribute('aria-busy', 'false');
  const banner = page.locator('.banner video');
  const moving = () => banner.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0);
  await expect.poll(moving).toBe(true);
  const before = await banner.getAttribute('src');
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  await page.getByRole('list', { name: 'Danh sách mẫu' }).getByRole('button', { name: 'Xoay quanh chậm', exact: true }).click();
  await expect(banner).not.toHaveAttribute('src', before!); // the same element, a new source
  await expect.poll(moving).toBe(true);
});

test('with reduced motion the Create banner, the preset picker and the Explore prompt grid still loop, as the reference site does', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'member6');
  await page.goto('/create?preset=gentle-push-in');
  const banner = page.locator('.banner video');
  await expect.poll(() => banner.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  const picked = page.getByRole('list', { name: 'Danh sách mẫu' }).locator('li', { hasText: 'Xoay quanh chậm' }).locator('video');
  await expect.poll(() => picked.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
  await page.keyboard.press('Escape');

  await page.goto('/explore');
  const tile = page.getByRole('list', { name: 'Mẫu' }).getByRole('link', { name: 'Xoay quanh chậm' }).locator('video');
  await tile.scrollIntoViewIfNeeded();
  await expect.poll(() => tile.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
});

test('with reduced motion the Explore model and feature cards and the Apps cards and header still loop', async ({ page }) => {
  // The test server has no samples, so the admin uploads the fixture clip under the slot names first and removes them afterwards.
  const clip = readFileSync(fileURLToPath(new URL('../public/fixtures/examples/example-1.mp4', import.meta.url)));
  const names = ['model-mock-e2e.mp4', 'app-character-swap.mp4', 'feature-try-on.mp4'];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) expect((await each(name)).ok()).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: clip, headers: { 'content-type': 'video/mp4' } }));
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'member6');
    const moves = (video: Locator) => expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);

    await page.goto('/explore');
    const model = page.getByRole('list', { name: 'Mô hình' }).getByRole('link', { name: /Mock E2E/ }).locator('video');
    await model.scrollIntoViewIfNeeded();
    await moves(model);
    const feature = page.getByRole('list', { name: 'Công cụ' }).locator('a[href="/try-on"] video');
    await feature.scrollIntoViewIfNeeded();
    await moves(feature);

    await page.goto('/apps');
    const card = page.getByRole('list', { name: 'Danh sách ứng dụng' }).locator('a[href="/apps/character-swap"] video');
    await card.scrollIntoViewIfNeeded();
    await moves(card);

    await page.goto('/apps/character-swap');
    await moves(page.locator('.head-loop video'));
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('with reduced motion the About clips still loop: a step tile and the result loop under the steps', async ({ page }) => {
  const clip = readFileSync(fileURLToPath(new URL('../public/fixtures/examples/example-1.mp4', import.meta.url)));
  const names = ['about-create-step-1.mp4', 'about-create-loop.mp4'];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) expect((await each(name)).ok()).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: clip, headers: { 'content-type': 'video/mp4' } }));
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member6');
    await page.goto('/create');
    await page.getByRole('tab', { name: 'Giới thiệu' }).click();
    const moves = (video: Locator) => expect.poll(async () => { await video.scrollIntoViewIfNeeded(); return video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0); }).toBe(true);
    await moves(page.locator('.about-media video').first());
    await moves(page.locator('.about-loop video'));
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('with reduced motion the Marketing format header and the hook and location pickers still loop, as on Fash; a chosen hook shows its still', async ({ page }) => {
  const clip = readFileSync(fileURLToPath(new URL('../public/fixtures/examples/example-1.mp4', import.meta.url)));
  const still = readFileSync(fileURLToPath(new URL('../public/fixtures/examples/example-1.jpg', import.meta.url)));
  const files: [string, Buffer, string][] = [['marketing-format-ugc.mp4', clip, 'video/mp4'], ['marketing-hook-blizzard.mp4', clip, 'video/mp4'], ['marketing-hook-blizzard.jpg', still, 'image/jpeg'], ['marketing-location-gym.mp4', clip, 'video/mp4']];
  const asAdmin = async (each: (name: string, data: Buffer, type: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const [name, data, type] of files) expect((await each(name, data, type)).ok()).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name, data, type) => page.request.put(`/api/admin/samples/${name}`, { data, headers: { 'content-type': type } }));
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member6');
    await page.goto('/marketing-studio');
    const moves = (video: Locator) => expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
    await moves(page.locator('.head-loop video'));

    const hookBox = page.getByRole('button', { name: /^Hook/ });
    await hookBox.click();
    const hooks = page.getByRole('dialog', { name: 'Chọn hook' });
    await moves(hooks.getByRole('option', { name: 'Bão tuyết', exact: true }).locator('video'));
    await hooks.getByRole('option', { name: 'Bão tuyết', exact: true }).click();
    await expect(hookBox.locator('img')).toHaveAttribute('src', '/api/samples/marketing-hook-blizzard.jpg');
    await expect(hookBox.locator('video')).toHaveCount(0);

    await page.getByRole('button', { name: /^Bối cảnh/ }).click();
    await moves(page.getByRole('dialog', { name: 'Chọn bối cảnh' }).getByRole('option', { name: 'Phòng tập', exact: true }).locator('video'));
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

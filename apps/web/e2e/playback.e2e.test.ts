// Motion parity (docs/UI-MOTION-PARITY.md, acceptance 3): the Examples clips really play from real video files, and the playback rules hold.
// A poster is never evidence of motion, so these specs read currentTime and decoded frames from the video elements.
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

test('at most 4 examples play at once, whatever is on screen', async ({ page }) => {
  const videos = await openExamples(page);
  await expect.poll(() => playing(videos)).toBe(4);
  let peak = 0;
  for (let i = 0; i < 15; i++) {
    peak = Math.max(peak, await playing(videos));
    await page.waitForTimeout(100);
  }
  evidence('play limit', { clips: CLIPS, peak });
  expect(peak).toBe(4);
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
  await expect.poll(() => playing(videos)).toBe(4);
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  await setVisibility('hidden');
  await expect.poll(() => playing(videos)).toBe(0);
  await setVisibility('visible');
  await expect.poll(() => playing(videos)).toBe(4);
});

test('C2: a broken source keeps a poster-sized placeholder, not a gap', async ({ page }) => {
  // The first tile is the first to get a play slot, so its broken source is hit at once (the tiles are dealt into columns, so tile 3 is no longer among the first four).
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

test('C2: with reduced motion nothing autoplays; a poster and a play button stay until the user presses play', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const videos = await openExamples(page);
  const buttons = page.getByRole('button', { name: /^Phát / });
  await expect(buttons).toHaveCount(CLIPS);
  await page.waitForTimeout(1500);
  expect(await playing(videos)).toBe(0);
  expect(await videos.evaluateAll((vs) => vs.every((v) => (v as HTMLVideoElement).poster.endsWith('.jpg')))).toBe(true);

  await buttons.first().click();
  await expect.poll(() => videos.first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  expect(await playing(videos)).toBe(1);
  await expect(buttons).toHaveCount(CLIPS - 1);
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
  await expect(select(page, 'Mẫu chuyển động')).not.toHaveText('Tự viết mô tả');
  const banner = page.locator('.banner video');
  const moving = () => banner.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0);
  await expect.poll(moving).toBe(true);
  const before = await banner.getAttribute('src');
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  await page.getByRole('list', { name: 'Danh sách mẫu' }).getByRole('button', { name: 'Xoay quanh chậm', exact: true }).click();
  await expect(banner).not.toHaveAttribute('src', before!); // the same element, a new source
  await expect.poll(moving).toBe(true);
});

test('with reduced motion the Explore prompt grid still loops, as the reference site does, while the Create banner keeps its poster', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'member6');
  const banner = page.locator('.banner video');
  await expect(banner).toHaveCount(1);
  await page.waitForTimeout(1500);
  expect(await banner.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  await page.goto('/explore');
  const tile = page.getByRole('list', { name: 'Mẫu' }).getByRole('link', { name: 'Xoay quanh chậm' }).locator('video');
  await tile.scrollIntoViewIfNeeded();
  await expect.poll(() => tile.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
});

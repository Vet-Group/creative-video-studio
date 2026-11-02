import { expect, test } from '@playwright/test';
import { runViaApi, signIn, today } from './support.test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a phone can play and download a clip', async ({ page }) => {
  await signIn(page, 'member3');
  await runViaApi(page);

  const card = page.getByRole('article').filter({ hasText: 'E2E Member 3' });
  await page.goto('/library');
  await expect(async () => {
    await page.reload();
    await expect(card).toHaveCount(1, { timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  // Nothing pushes the page sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const video = card.locator('video');
  await expect(video).toBeVisible();
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);

  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Tải xuống' }).click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^${today()}-e2e-member-3-[0-9a-f]{8}\\.mp4$`));

  // Touch targets: every icon action of a result is at least 44 px square, on the grid card and in the list row.
  const tooSmall = () => card.locator('.icon-button').evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().width < 44 || b.getBoundingClientRect().height < 44).map((b) => b.getAttribute('aria-label')));
  await expect(card.locator('.icon-button')).not.toHaveCount(0);
  expect(await tooSmall()).toEqual([]);
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
  await expect(card.locator('.lib-thumb')).toBeVisible();
  expect(await tooSmall()).toEqual([]);
});

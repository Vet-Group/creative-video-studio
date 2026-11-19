// The tutorial videos: a tool's About tab and the tutorials page show a video with sound and controls once its sample is uploaded, and nothing before.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../public/fixtures/examples/${name}`, import.meta.url)));

/** Answers as if an Admin had uploaded these samples: the e2e bucket holds none. */
async function withSamples(page: Page, names: string[]): Promise<void> {
  await page.route('**/api/samples', async (r) =>
    r.fulfill({ json: { samples: [...((await (await r.fetch()).json()) as { samples: object[] }).samples, ...names.map((name) => ({ name, bytes: 1, version: 'v1' }))] } }),
  );
  for (const name of names) {
    const video = name.endsWith('.mp4');
    await page.route(new RegExp(`/api/samples/${name.replace('.', '\\.')}(\\?|$)`), (r) => r.fulfill({ body: fixture(video ? 'example-1.mp4' : 'example-1.jpg'), contentType: video ? 'video/mp4' : 'image/jpeg' }));
  }
}

test('a tutorial tops the Try On About and the Hướng dẫn page once uploaded, with sound and controls; before that only the titles and links show', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'tutor');
  await page.goto('/try-on');
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Thử đồ trên người mẫu' })).toBeVisible();
  await expect(page.locator('.about-video')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Hướng dẫn' }).click();
  await expect(page).toHaveURL(/\/tutorials$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hướng dẫn' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Thử đồ', 'Tạo ảnh', 'Tạo video']);
  await expect(page.getByRole('link', { name: 'Mở Thử đồ' })).toHaveAttribute('href', '/try-on');
  await expect(page.locator('.about-video')).toHaveCount(0);

  await withSamples(page, ['tutorial-tour.mp4', 'tutorial-try-on.mp4', 'tutorial-try-on.jpg']);
  await page.reload();
  const videos = page.locator('.about-video video');
  await expect(videos).toHaveCount(2); // the tour and Try On; Tạo ảnh and Tạo video have none uploaded
  await expect(videos.first()).toHaveAccessibleName('Video hướng dẫn: Làm quen với CVS');
  const tryOn = videos.nth(1);
  await expect(tryOn).toHaveAttribute('src', '/api/samples/tutorial-try-on.mp4?v=v1');
  await expect(tryOn).toHaveAttribute('poster', '/api/samples/tutorial-try-on.jpg?v=v1');
  expect(await tryOn.evaluate((v: HTMLVideoElement) => ({ controls: v.controls, muted: v.muted, autoplay: v.autoplay, loop: v.loop }))).toEqual({ controls: true, muted: false, autoplay: false, loop: false });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {}))));
    expect((await new AxeBuilder({ page }).exclude('nextjs-portal').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]); // as e2e/a11y
  }

  // The same sample in the tool's About, under the title and lead and before the first section.
  await page.getByRole('link', { name: 'Mở Thử đồ' }).click();
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  const about = page.locator('article.about');
  await expect(about.locator('> .about-video video')).toHaveAttribute('src', '/api/samples/tutorial-try-on.mp4?v=v1');
  await expect(about.locator('> *').nth(2)).toHaveClass('about-video');

  // A phone keeps the video inside the column at 16:9.
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(about.locator('.about-video video')).toBeVisible();
  const box = (await about.locator('.about-video video').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);
});

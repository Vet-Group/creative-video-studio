// The tutorial videos: a tool's About tab and the tutorials page show a video with sound once its sample is uploaded, and nothing before;
// a large play button over the poster starts it, then the native controls take over.
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
    const type = name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.vtt') ? 'text/vtt' : 'image/jpeg';
    const body = type === 'text/vtt' ? 'WEBVTT\n\n00:00.000 --> 00:01.000\nThử đồ\n' : fixture(type === 'video/mp4' ? 'example-1.mp4' : 'example-1.jpg');
    await page.route(new RegExp(`/api/samples/${name.replace('.', '\\.')}(\\?|$)`), (r) => r.fulfill({ body, contentType: type }));
  }
}

test('a tutorial tops the Try On About and the Hướng dẫn page once uploaded, with sound behind a play button; before that only the titles and links show', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'tutor');
  await page.goto('/try-on');
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Thử đồ trên người mẫu' })).toBeVisible();
  await expect(page.locator('.about-video')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Hướng dẫn' }).click();
  await expect(page).toHaveURL(/\/tutorials$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hướng dẫn' })).toBeVisible();
  // The Phân tích section follows the sidebar's flag (off on CI).
  const analyze = (await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Phân tích' }).count()) > 0;
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Điều khiển chuyển động', ...(analyze ? ['Phân tích'] : [])]);
  await expect(page.getByRole('link', { name: 'Mở Điều khiển chuyển động' })).toHaveAttribute('href', '/apps/motion-control');
  await expect(page.getByRole('link', { name: 'Mở Thử đồ' })).toHaveAttribute('href', '/try-on');
  await expect(page.locator('.about-video')).toHaveCount(0);

  await withSamples(page, ['tutorial-tour.mp4', 'tutorial-try-on.mp4', 'tutorial-try-on.jpg', 'tutorial-try-on.vtt']);
  await page.reload();
  const videos = page.locator('.about-video video');
  await expect(videos).toHaveCount(2); // the tour and Try On; Tạo ảnh and Tạo video have none uploaded
  await expect(videos.first()).toHaveAccessibleName('Video hướng dẫn: Làm quen với CVS');
  const tryOn = videos.nth(1);
  await expect(tryOn).toHaveAttribute('src', '/api/samples/tutorial-try-on.mp4?v=v1');
  await expect(tryOn).toHaveAttribute('poster', '/api/samples/tutorial-try-on.jpg?v=v1');
  const state = () => tryOn.evaluate((v: HTMLVideoElement) => ({ controls: v.controls, muted: v.muted, autoplay: v.autoplay, loop: v.loop }));
  expect(await state()).toEqual({ controls: false, muted: false, autoplay: false, loop: false }); // the play button first
  // Captions from the uploaded .vtt, off until the viewer turns them on (the clips burn theirs in); the tour has none.
  await expect(tryOn.locator('track')).toHaveAttribute('src', '/api/samples/tutorial-try-on.vtt?v=v1');
  expect(await tryOn.locator('track').evaluate((t: HTMLTrackElement) => [t.kind, t.srclang, t.label, t.default])).toEqual(['captions', 'vi', 'Tiếng Việt', false]);
  await expect(videos.first().locator('track')).toHaveCount(0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {}))));
    expect((await new AxeBuilder({ page }).exclude('nextjs-portal').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]); // as e2e/a11y
  }
  // The play button starts the video with sound and hands the keyboard to the player's own controls.
  const play = page.getByRole('button', { name: 'Phát video hướng dẫn: Thử đồ trên người mẫu' });
  await play.press('Enter');
  await expect(play).toHaveCount(0);
  expect(await state()).toEqual({ controls: true, muted: false, autoplay: false, loop: false });
  await expect(tryOn).toBeFocused();
  await expect.poll(() => tryOn.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);

  // The same sample in the tool's About, under the title, lead and update date and before the first section.
  await page.getByRole('link', { name: 'Mở Thử đồ' }).click();
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  const about = page.locator('article.about');
  await expect(about.locator('> .about-video video')).toHaveAttribute('src', '/api/samples/tutorial-try-on.mp4?v=v1');
  await expect(about.locator('> *').nth(2)).toHaveClass('about-updated');
  await expect(about.locator('> *').nth(3)).toHaveClass('about-video');
  await expect(about.locator('.about-updated a')).toHaveAttribute('href', '/changelog');
  await expect(about.locator('.about-updated a')).toHaveText(/^Cập nhật [0-9]{2}[/][0-9]{2}[/][0-9]{4}$/);

  // A phone keeps the video inside the column at 16:9.
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(about.locator('.about-video video')).toBeVisible();
  const box = (await about.locator('.about-video video').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);
});

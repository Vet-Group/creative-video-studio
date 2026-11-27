import { expect, type Locator, type Page, test } from '@playwright/test';
import { openTab, png, signIn } from './support.test';

// The picture viewer on a touch screen: double tap zooms, a swipe down closes, a swipe or an arrow steps to the next photo of a post, and the download button saves the original.
test.describe('image viewer gestures', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  async function upload(page: Page): Promise<string> {
    const up = await page.request.post('/api/assets', { multipart: { file: { name: 'ref.png', mimeType: 'image/png', buffer: png() } } });
    expect(up.status()).toBe(201);
    return ((await up.json()) as { assets: { id: string }[] }).assets[0]!.id;
  }

  /** A real finger drag (Chrome's touch input), as the page's pointer events see it. */
  async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    const at = (t: number) => [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (const t of [0.25, 0.5, 0.75, 1]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(t) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }

  const scaleOf = (img: Locator) => img.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const centre = async (el: Locator) => {
    const b = (await el.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  async function fingerSized(button: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    const b = (await button.boundingBox())!;
    expect(b.width, 'wide enough').toBeGreaterThanOrEqual(44);
    expect(b.height, 'tall enough').toBeGreaterThanOrEqual(44);
    return b;
  }

  test('double tap zooms, a swipe down closes, and the download button saves the original', async ({ page }) => {
    await signIn(page, 'viewergest');
    const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [await upload(page)], ratio: '3:4', prompt: 'a picture to zoom and swipe', enhance: false, params: { resolution: '1K' } } });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    try {
      await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
      const out = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; outputAssetId: string }[] }).jobs.find((j) => j.id === id)!.outputAssetId;

      await page.goto('/image-generation');
      await openTab(page, 'Lịch sử');
      await page.locator('.job-card').first().getByRole('button', { name: 'Toàn màn hình' }).tap();
      const viewer = page.locator('dialog.image-viewer');
      const img = viewer.locator('img');
      await expect(img).toBeVisible();
      expect(await scaleOf(img)).toBe(1);
      // A card holds one picture: no arrows.
      await expect(viewer.getByRole('button', { name: 'Ảnh sau' })).toHaveCount(0);

      // Double tap zooms about the point, and a second double tap puts it back.
      const at = await centre(img);
      await page.touchscreen.tap(at.x, at.y);
      await page.touchscreen.tap(at.x, at.y);
      await expect.poll(() => scaleOf(img)).toBeGreaterThan(1);
      await page.touchscreen.tap(at.x, at.y);
      await page.touchscreen.tap(at.x, at.y);
      await expect.poll(() => scaleOf(img)).toBe(1);

      // Download: beside the close button, finger-sized, and it asks for the original's file.
      const close = await fingerSized(viewer.getByRole('button', { name: 'Đóng' }));
      const dl = viewer.getByRole('button', { name: 'Tải xuống' });
      const save = await fingerSized(dl);
      expect(save.x + save.width, 'download clear of close').toBeLessThanOrEqual(close.x);
      const [file] = await Promise.all([page.waitForEvent('download'), dl.tap()]);
      expect(new URL(file.url()).pathname).toBe(`/api/assets/${out}/download`);

      // A drag down from the middle closes it.
      await swipe(page, at, { x: at.x, y: at.y + 400 });
      await expect(viewer).toHaveCount(0);
    } finally {
      await page.request.delete(`/api/jobs/${id}`);
    }
  });

  test('the photos of a Góp ý post step with the arrows, the keys and a swipe', async ({ page }) => {
    await signIn(page, 'viewergest');
    const [a, b] = [await upload(page), await upload(page)];
    const post = await page.request.post('/api/feedback', { data: { kind: 'bug', title: 'Hai ảnh đính kèm', body: 'Xem từng ảnh.', assetIds: [a, b] } });
    expect(post.ok()).toBe(true);
    await page.goto(`/feedback/${((await post.json()) as { id: string }).id}`);
    await page.getByRole('button', { name: 'Xem lớn ảnh 1' }).tap();
    const viewer = page.locator('dialog.image-viewer');
    const img = viewer.locator('img');
    const next = viewer.getByRole('button', { name: 'Ảnh sau' });
    const prev = viewer.getByRole('button', { name: 'Ảnh trước' });
    await expect(img).toHaveAttribute('src', `/api/assets/${a}/content`);
    await expect(prev).toHaveCount(0); // the first photo has nothing before it

    await fingerSized(next);
    await next.tap();
    await expect(img).toHaveAttribute('src', `/api/assets/${b}/content`);
    await expect(next).toHaveCount(0);
    await fingerSized(prev);

    await page.keyboard.press('ArrowLeft');
    await expect(img).toHaveAttribute('src', `/api/assets/${a}/content`);
    await page.keyboard.press('ArrowRight');
    await expect(img).toHaveAttribute('src', `/api/assets/${b}/content`);

    // A swipe right shows the photo before, back at scale 1.
    const at = await centre(img);
    await swipe(page, { x: at.x - 150, y: at.y }, { x: at.x + 150, y: at.y });
    await expect(img).toHaveAttribute('src', `/api/assets/${a}/content`);
    expect(await scaleOf(img)).toBe(1);
    await viewer.getByRole('button', { name: 'Đóng' }).tap();
    await expect(viewer).toHaveCount(0);
  });

  test('at phone width the close, download and arrow buttons stay clear of each other', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'viewergest');
    const [a, b] = [await upload(page), await upload(page)];
    const post = await page.request.post('/api/feedback', { data: { kind: 'bug', title: 'Ảnh trên điện thoại', body: 'Các nút của ảnh.', assetIds: [a, b] } });
    await page.goto(`/feedback/${((await post.json()) as { id: string }).id}`);
    await page.getByRole('button', { name: 'Xem lớn ảnh 2' }).tap();
    const viewer = page.locator('dialog.image-viewer');
    const boxes = [];
    for (const name of ['Đóng', 'Tải xuống', 'Ảnh trước']) boxes.push(await fingerSized(viewer.getByRole('button', { name })));
    for (const [i, p] of boxes.entries())
      for (const q of boxes.slice(i + 1)) expect(p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y, 'buttons overlap').toBe(true);
    for (const p of boxes) expect(p.x >= 0 && p.x + p.width <= 390).toBe(true);
  });
});

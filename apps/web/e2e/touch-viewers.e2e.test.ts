import { expect, type Locator, type Page, test } from '@playwright/test';
import { addExamples, openTab, png, signIn } from './support.test';

// On an iPad-sized touch screen (no hover, no mouse) every "view large" control opens the picture in the page with a 44 px close button:
// no element full screen, which an iPad leaves no way out of, and no new tab, which the installed app (display: standalone) has no way back from.
// Before 2026-11-27 the History card's full screen did both, the History input's zoom button was hidden on touch and feedback photos opened a new tab.
test.describe('touch tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  /** A finger's tap where the member sees the element, `dy` from its top, whatever is drawn over it. */
  async function tapAt(page: Page, el: Locator, dy: number): Promise<void> {
    await el.scrollIntoViewIfNeeded();
    const b = (await el.boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + dy);
  }

  /** The viewer shows the picture over the page and closes from its 44 px button, leaving one tab and no element full screen. */
  async function closesInPlace(page: Page, viewer: Locator, src?: string): Promise<void> {
    await expect(viewer.locator('img')).toBeVisible();
    if (src) await expect(viewer.locator('img')).toHaveAttribute('src', src);
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    expect(page.context().pages()).toHaveLength(1);
    const close = viewer.getByRole('button', { name: 'Đóng' });
    const box = (await close.boundingBox())!;
    expect(box.width, 'close button wide').toBeGreaterThanOrEqual(44);
    expect(box.height, 'close button tall').toBeGreaterThanOrEqual(44);
    await close.tap();
    await expect(viewer).toHaveCount(0);
  }

  test('History, the Library, Examples and Góp ý open pictures in the page with a way out', async ({ page, browser }) => {
    await signIn(page, 'tabletv');
    const up = await page.request.post('/api/assets', { multipart: { file: { name: 'ref.png', mimeType: 'image/png', buffer: png() } } });
    expect(up.status()).toBe(201);
    const input = ((await up.json()) as { assets: { id: string }[] }).assets[0]!.id;
    const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [input], ratio: '3:4', prompt: 'a picture to view on a tablet', enhance: false, params: { resolution: '1K' } } });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    try {
      await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
      const out = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; outputAssetId: string }[] }).jobs.find((j) => j.id === id)!.outputAssetId;
      const original = `/api/assets/${out}/content`;

      // History: the result's full screen button, then the input's view-large button (beside a form a tap on the photo itself uses it).
      await page.goto('/image-generation');
      await openTab(page, 'Lịch sử');
      const card = page.locator('.job-card').first();
      const full = card.getByRole('button', { name: 'Toàn màn hình' });
      await expect(full).toBeVisible();
      const tools = (await full.boundingBox())!;
      expect(Math.min(tools.width, tools.height), 'the picture tools take a finger').toBeGreaterThanOrEqual(44);
      await full.tap();
      await closesInPlace(page, page.locator('dialog.image-viewer'), original);
      await card.getByRole('button', { name: 'Xem lớn ảnh 1' }).last().tap();
      await closesInPlace(page, page.locator('dialog.input-viewer'));

      // Library: the item's details, then its full screen button.
      await page.goto('/library');
      await page.locator(`article[data-clip-id="${id}"]`).getByRole('button', { name: 'Xem chi tiết' }).tap();
      const detail = page.getByRole('dialog', { name: /^Chi tiết: / });
      await detail.getByRole('button', { name: 'Toàn màn hình' }).tap();
      await closesInPlace(page, page.locator('dialog.image-viewer'), original);
      await expect(detail).toBeVisible(); // the viewer closes alone, the details stay
      await page.keyboard.press('Escape');

      // Examples: the same result once an Admin put it there, opened from its tile.
      await addExamples(browser, [id]);
      await page.goto('/image-generation');
      await openTab(page, 'Ví dụ');
      await tapAt(page, page.getByRole('link', { name: /^Xem chi tiết ảnh/ }).first(), 12); // near the top, clear of the Use this example button
      const example = page.getByRole('dialog', { name: /^Chi tiết: / });
      await example.getByRole('button', { name: 'Toàn màn hình' }).tap();
      await closesInPlace(page, page.locator('dialog.image-viewer'), original);
      await page.keyboard.press('Escape');

      // Góp ý: a post's attached photo.
      const post = await page.request.post('/api/feedback', { data: { kind: 'bug', title: 'Ảnh trên máy tính bảng', body: 'Có ảnh đính kèm.', assetIds: [input] } });
      expect(post.ok()).toBe(true);
      await page.goto(`/feedback/${((await post.json()) as { id: string }).id}`);
      await page.getByRole('button', { name: 'Xem lớn ảnh 1' }).tap();
      await closesInPlace(page, page.locator('dialog.image-viewer'), `/api/assets/${input}/content`);
    } finally {
      await page.request.delete(`/api/jobs/${id}`);
    }
  });

  // An empty shelf's "Thêm sản phẩm" opens the shelf over the form instead of a new tab, and closing it comes back to the picker.
  test('an empty product shelf opens the shelf in the page and comes back to the picker', async ({ page }) => {
    await signIn(page, 'tabletv'); // owns no product
    await page.goto('/create');
    const link = page.getByRole('button', { name: 'Từ kệ sản phẩm', exact: true });
    await expect(link).toBeEnabled();
    await link.tap();
    const picker = page.getByRole('dialog', { name: 'Kệ sản phẩm' });
    await picker.getByRole('button', { name: 'Thêm sản phẩm' }).tap();
    const shelf = page.getByRole('dialog', { name: 'Sản phẩm đã lưu' });
    await expect(shelf.getByText('Chưa có sản phẩm nào', { exact: false })).toBeVisible();
    expect(page.context().pages()).toHaveLength(1);
    await shelf.getByRole('button', { name: 'Đóng' }).first().tap();
    await expect(shelf).toHaveCount(0);
    await expect(picker).toBeVisible();
  });
});

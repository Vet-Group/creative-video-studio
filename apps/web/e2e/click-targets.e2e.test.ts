import { expect, type Locator, type Page, test } from '@playwright/test';
import { addExamples, jpg, openTab, png, signIn } from './support.test';

// Members click a card where they see it, not where its button happens to sit: these specs click with the mouse at the spot a member aims for
// (a corner of a dashed slot, the middle of a banner, a picture, the edge of a pill or a row), whatever lies on top, as preset-pick.e2e does.

/** A point inside the element's box, scrolled into view: `dx`, `dy` from its top left, or its centre. */
async function at(el: Locator, dx?: number, dy?: number): Promise<[number, number]> {
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  return [b.x + (dx ?? b.width / 2), b.y + (dy ?? b.height / 2)];
}

/** Clicks the point and expects the browser's file picker. */
async function opensFilePicker(page: Page, [x, y]: [number, number]): Promise<void> {
  const chooser = page.waitForEvent('filechooser', { timeout: 5_000 });
  await page.mouse.click(x, y);
  await chooser;
}

/** Uploads samples as the Admin, runs `body` as `who`, and removes the samples again. */
async function withSamples(page: Page, files: [string, Buffer, string][], who: Parameters<typeof signIn>[1], body: () => Promise<void>): Promise<void> {
  const asAdmin = async (each: (name: string, data: Buffer, type: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const [name, data, type] of files) expect((await each(name, data, type)).ok(), name).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name, data, type) => page.request.put(`/api/admin/samples/${name}`, { data, headers: { 'content-type': type } }));
  try {
    await signIn(page, who);
    await body();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
}

test('the whole dashed upload slot opens the file picker, its pictures too, and the Marketing Studio banner opens the format picker', async ({ page }) => {
  await signIn(page, 'clicka');
  await page.goto('/try-on');
  const garments = page.getByRole('group', { name: 'Trang phục' });
  await expect(page.getByLabel('Ảnh trang phục')).toBeEnabled(); // hydrated
  await opensFilePicker(page, await at(garments, 6, 6)); // the slot's corner, outside its inner tile
  await page.getByLabel('Ảnh trang phục').setInputFiles({ name: 'dress.png', mimeType: 'image/png', buffer: png() });
  const thumb = garments.getByRole('img', { name: 'dress.png' });
  await expect(thumb).toBeVisible();
  await opensFilePicker(page, await at(thumb)); // a picked garment: room for four more
  await opensFilePicker(page, await at(garments, 6, 6));
  await garments.getByRole('button', { name: 'Bỏ ảnh dress.png' }).click(); // its remove button stays on top
  await expect(thumb).toBeHidden();

  await page.goto('/marketing-studio');
  await expect(page.getByLabel('Ảnh người mẫu')).toBeEnabled();
  await opensFilePicker(page, await at(page.getByRole('group', { name: 'Người mẫu' }), 6, 6));
  await page.mouse.click(...(await at(page.locator('.marketing-head')))); // the loop and the format name, not the Change chip
  await expect(page.getByRole('dialog', { name: 'Chọn định dạng' })).toBeVisible();
});

test('Create: a picked photo in the drop zone adds more like the rest of it, a whole detail pill applies its setting, and the Model and Audio labels work their controls', async ({ page }) => {
  const details = { prompt: 'A slow orbit around the bottle.', images: [], presetId: null, enhance: false, audio: 'off', ratio: '1:1', aspect: '1:1', resolution: '720p', durationSec: 8, modelId: 'mock-e2e', storeId: null, date: '2026-08-18' };
  await withSamples(page, [['example-2.json', Buffer.from(JSON.stringify(details)), 'application/json']], 'clickb', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/create');
    await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
    await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: png() });
    const thumb = page.getByRole('img', { name: 'shirt.png' });
    await expect(thumb).toBeVisible();
    await opensFilePicker(page, await at(thumb)); // the drop zone asks for a click to add more, the picture included
    await page.getByRole('button', { name: 'Bỏ ảnh shirt.png' }).click();
    await expect(thumb).toBeHidden();

    // The labels beside the model picker and the audio switch work them, as the select labels already do.
    await page.mouse.click(...(await at(page.locator('.field-label').filter({ hasText: /^\s*Mô hình\s*$/ }), 4)));
    await expect(page.getByRole('dialog', { name: 'Chọn mô hình' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Chọn mô hình' })).toBeHidden();
    const audio = page.getByRole('switch', { name: 'Tạo âm thanh' });
    await expect(audio).toHaveAttribute('aria-checked', 'true');
    await page.mouse.click(...(await at(page.locator('.field-label').filter({ hasText: /^\s*Tạo âm thanh\s*$/ }), 4)));
    await expect(audio).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('tab', { name: 'Ví dụ' }).click();
    await page.getByRole('button', { name: 'Tự viết mô tả', exact: true }).click({ position: { x: 12, y: 12 } });
    const detail = page.getByRole('dialog', { name: 'Chi tiết ví dụ' });
    const pill = detail.getByRole('list', { name: 'Thông số' }).getByRole('listitem', { name: 'Thời lượng 8 giây' });
    await page.mouse.click(...(await at(pill, 3))); // the pill's own padding, left of its text
    await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã chọn thời lượng 8s')).toBeVisible();
  });
});

test('a switch a model cannot use says why on hover', async ({ page }) => {
  await page.route('**/api/models?*', async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { models: { audioEstimateUsd: string | null }[] };
    for (const m of json.models) m.audioEstimateUsd = null;
    await route.fulfill({ response: res, json });
  });
  await signIn(page, 'clickb');
  const audio = page.getByRole('switch', { name: 'Tạo âm thanh' });
  await expect(audio).toBeDisabled();
  await expect(page.locator('.switch-row')).toHaveAttribute('title', 'Mô hình này không tạo được âm thanh');
  await page.unrouteAll({ behavior: 'ignoreErrors' }); // a models request still in flight must not fail the test as the page closes
});

test('an image result opens full screen from the picture in History, and an image tile in Examples opens its details from anywhere on the tile', async ({ page, browser }) => {
  await withSamples(page, [['image-example-1.jpg', jpg(), 'image/jpeg']], 'clickc', async () => {
    const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt: 'a picture to click', enhance: false, params: { resolution: '1K' } } });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    try {
      await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
      const done = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; outputAssetId: string; posterAssetId: string | null }[] }).jobs.find((j) => j.id === id)!;
      const [out, preview] = [done.outputAssetId, done.posterAssetId];
      expect(preview).not.toBeNull();
      await addExamples(browser, [id]); // Examples lists a result only once an Admin put it there
      await page.goto('/image-generation');
      await openTab(page, 'Lịch sử');
      // The card shows the small preview; full screen shows the original.
      const picture = page.locator(`.job-media img[src="/api/assets/${preview}/content"]`);
      await expect(picture).toBeVisible();
      await page.mouse.click(...(await at(picture)));
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName ?? null)).toBe('IMG');
      expect(await page.evaluate(() => document.fullscreenElement?.getAttribute('src'))).toBe(`/api/assets/${out}/content`);
      await page.evaluate(() => document.exitFullscreen());

      await page.getByRole('tab', { name: 'Ví dụ' }).click();
      const gallery = page.getByRole('group', { name: 'Ảnh của công ty' });
      // A sample without a details file opens its picture in a new tab.
      const sample = gallery.locator('.gallery-item:has(img[src="/api/samples/image-example-1.jpg"])');
      await expect(sample).toBeVisible();
      const opened = page.context().waitForEvent('page', { timeout: 5_000 });
      await page.mouse.click(...(await at(sample, undefined, 12))); // near the top, clear of the Use this template pill
      const tab = await opened;
      await tab.waitForURL((u) => u.pathname === '/api/samples/image-example-1.jpg'); // a new tab reports an empty URL until its first navigation commits
      await tab.close();
      // A result's tile shows its preview and opens its details in place, as in the Library, with a 1600 px preview of the original.
      const result = gallery.locator(`.gallery-item:has(img[src="/api/assets/${preview}/content"])`);
      await page.mouse.click(...(await at(result, undefined, 12)));
      await expect(page.getByRole('dialog', { name: /^Chi tiết: / }).locator(`img[src="/api/assets/${out}/thumb?w=1600"]`)).toBeVisible();
    } finally {
      await page.request.delete(`/api/jobs/${id}`);
    }
  });
});

test('a saved template opens from anywhere on its row in My templates', async ({ page }) => {
  await signIn(page, 'clickd');
  const saved = await page.request.post('/api/templates', { data: { feature: 'try_on', name: 'Row click', data: { brief: 'a studio shot' } } });
  expect(saved.ok()).toBe(true);
  const { id } = (await saved.json()) as { id: string };
  try {
    await page.goto('/try-on');
    await expect(page.getByLabel('Ảnh trang phục')).toBeEnabled();
    await page.getByRole('button', { name: 'Thiết lập đã lưu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Thiết lập đã lưu' });
    const row = dialog.getByRole('listitem').filter({ hasText: 'Row click' });
    const refill = page.waitForRequest((r) => r.url().endsWith(`/api/templates/${id}`), { timeout: 5_000 });
    await page.mouse.click(...(await at(row, 4))); // the row's padding, left of the name
    await refill;
    await expect(dialog).toBeHidden();
  } finally {
    await page.request.delete(`/api/templates/${encodeURIComponent(id)}`);
  }
});

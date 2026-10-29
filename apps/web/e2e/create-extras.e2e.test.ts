import { expect, type Page, test } from '@playwright/test';
import { png, signIn } from './support.test';

// What Create video adds on a fal model that takes it, as Fash's Create Videos page does: an End frame slot. The mock model takes none (the models API
// reads them from fal's request builders), so the spec gives it the flags in the models answer and checks the Run's body without making the job.

/** The mock models with `extras` merged into each, as the models API would answer for a fal model that has them. */
async function withExtras(page: Page, extras: Record<string, unknown>): Promise<void> {
  await page.route('**/api/models?*', async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { models: Record<string, unknown>[] };
    for (const m of json.models) Object.assign(m, extras);
    await route.fulfill({ response: res, json });
  });
}

/** The body of the next Run; the job is answered as queued and never made, since the mock model would refuse the extras. */
function nextRun(page: Page): Promise<{ assetIds: string[]; params: Record<string, unknown> }> {
  return new Promise((resolve) => {
    void page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      resolve(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: 'caught', status: 'queued' } });
    });
  });
}

const endSlot = (page: Page) => page.getByRole('group', { name: 'Khung hình cuối' });

test('the End frame slot shows only for a model that takes one, and its image goes with the Run', async ({ page }) => {
  await signIn(page, 'cvxa');
  await expect(page.getByRole('button', { name: /^Mô hình / })).toContainText('Mock E2E');
  await expect(endSlot(page)).toHaveCount(0); // the mock endpoint takes no end frame

  await withExtras(page, { endFrame: true });
  await page.reload();
  await expect(endSlot(page)).toBeVisible();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'start.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Ảnh khung hình cuối').setInputFiles({ name: 'end.png', mimeType: 'image/png', buffer: png() });
  await expect(endSlot(page).getByRole('img', { name: 'end.png' })).toBeVisible();
  await expect(endSlot(page).getByRole('button', { name: /^Tải lên/ })).toHaveCount(0); // one end frame at most
  await page.getByLabel('Mô tả chuyển động').fill('The bottle turns to face the camera.');
  const body = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  const sent = await body;
  expect(sent.assetIds).toHaveLength(1);
  expect(sent.params).toEqual({ audio: 'on', endAssetId: expect.any(String) });
  expect(sent.assetIds).not.toContain(sent.params.endAssetId);

  // Removed, it is not sent.
  await endSlot(page).getByRole('button', { name: 'Bỏ ảnh end.png' }).click();
  const again = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  expect((await again).params).toEqual({ audio: 'on' });
});

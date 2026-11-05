import { expect, type Page, test } from '@playwright/test';
import { png, signIn } from './support.test';

// Marketing Studio's end of the clip (owner decision 2026-11-05: both): an End frame slot on a model that takes one, the end scene added to the prompt,
// and the end text that the worker burns over the last 2 s. The mock model takes no end frame, so the first test gives it the flag in the models
// answer and catches the Run's body; the second runs the mock model for real, through the worker's overlay.

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const endSlot = (page: Page) => page.getByRole('group', { name: 'Khung hình cuối' });
const ENDING = 'Người mẫu mỉm cười và giơ sản phẩm về phía máy quay';
const END_TEXT = 'Giảm 50% hôm nay – Đặt ngay!';

async function openPage(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Marketing Studio' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  await expect(page.getByLabel('Ảnh người mẫu')).toBeEnabled(); // files set before hydration are dropped
}

async function fill(page: Page): Promise<void> {
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(page.getByRole('img', { name: 'model.png' })).toBeVisible();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await page.getByLabel('Cảnh kết (tuỳ chọn)').fill(ENDING);
  await page.getByLabel('Chữ trên khung cuối (tuỳ chọn)').fill(END_TEXT);
}

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test('the End frame slot shows only for a model that takes one, and the end frame, Cảnh kết and Chữ trên khung cuối go with the Run', async ({ page }) => {
  await signIn(page, 'mkth');
  await openPage(page);
  await expect(page.getByRole('button', { name: /^Mô hình / })).toContainText('Mock E2E');
  await expect(endSlot(page)).toHaveCount(0); // the mock endpoint takes no end frame
  // The position shows once there is text to place.
  await expect(page.getByRole('radiogroup', { name: 'Vị trí chữ' })).toHaveCount(0);

  await page.route('**/api/models?*', async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { models: Record<string, unknown>[] };
    for (const m of json.models) m.endFrame = true;
    await route.fulfill({ response: res, json });
  });
  await page.reload();
  await expect(endSlot(page)).toBeVisible();
  await fill(page);
  await page.getByLabel('Ảnh khung hình cuối').setInputFiles(file('end.png'));
  await expect(endSlot(page).getByRole('img', { name: 'end.png' })).toBeVisible();
  const positions = page.getByRole('radiogroup', { name: 'Vị trí chữ' });
  await expect(positions.getByRole('radio', { name: 'Dưới' })).toBeChecked();
  await positions.getByText('Trên').click();
  await expect(page.locator('.prompt-preview')).toContainText(`It ends with: ${ENDING}.`);

  // The job is answered as queued and never made, since the mock model would refuse the end frame.
  const sent = new Promise<{ prompt: string; params: Record<string, unknown> }>((resolve) => {
    void page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      resolve(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: 'caught', status: 'queued' } });
    });
  });
  await runButton(page).click();
  const body = await sent;
  expect(body.params).toMatchObject({ endAssetId: expect.any(String), ending: ENDING, endText: END_TEXT, endTextPos: 'top' });
  expect(body.prompt).toContain(`It ends with: ${ENDING}.`);
  expect(body.prompt).not.toContain(END_TEXT); // the end text is drawn by the worker, never asked of the model
});

test('a mock Run keeps Cảnh kết and Chữ trên khung cuối, the worker burns the text in, and Dùng lại refills both', async ({ page }) => {
  await signIn(page, 'mkth');
  await openPage(page);
  await fill(page);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();

  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string; feature: string }[] }).jobs.filter((j) => j.feature === 'marketing');
  await expect.poll(async () => (await mine())[0]?.status, { timeout: 60_000 }).toBe('succeeded');
  const id = (await mine())[0]!.id;
  const detail = (await (await page.request.get(`/api/jobs/${id}`)).json()) as Record<string, unknown>;
  // A null error: the overlay ran (a failed one keeps the clip and says so in the error).
  expect(detail).toMatchObject({ ending: ENDING, endText: END_TEXT, endTextPos: 'bottom', error: null, endFrame: null });
  expect(detail.prompt).toContain(`It ends with: ${ENDING}.`);

  await page.goto(`/marketing-studio?reuse=${id}`);
  await expect(page.getByLabel('Cảnh kết (tuỳ chọn)')).toHaveValue(ENDING);
  await expect(page.getByLabel('Chữ trên khung cuối (tuỳ chọn)')).toHaveValue(END_TEXT);
  await expect(page.getByRole('radiogroup', { name: 'Vị trí chữ' }).getByRole('radio', { name: 'Dưới' })).toBeChecked();
});

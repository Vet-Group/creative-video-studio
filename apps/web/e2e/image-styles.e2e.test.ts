import { expect, type Page, test } from '@playwright/test';
import { modelButton, signIn } from './support.test';

// Image Generation's style presets (presets.feature `image`): the chip in the prompt bar opens the style picker, a picked style goes with Run
// by id (the server adds its prompt), and a template editor edits a style in place as on Create. Mock models only.

/** Opens the style picker once the page has hydrated and the mock model is chosen. */
async function openStyles(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/image-generation');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await page.getByRole('group', { name: 'Thanh tạo ảnh' }).getByRole('button', { name: 'Phong cách', exact: true }).click();
  return page.getByRole('dialog', { name: 'Chọn phong cách' }).getByRole('list', { name: 'Danh sách phong cách' });
}

test('a member picks a style, and a mock Run sends its id while History and Reuse keep the member’s own words', async ({ page }) => {
  await signIn(page, 'stylea');
  const grid = await openStyles(page);
  await expect(grid.getByRole('button', { name: /^Đề xuất sửa phong cách / })).toHaveCount(8); // a member proposes and edits nothing directly
  await expect(grid.getByRole('button', { name: /^Sửa phong cách / })).toHaveCount(0);
  await grid.getByRole('button', { name: 'Đường phố', exact: true }).click();
  await expect(grid).toBeHidden();
  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  await expect(bar.getByRole('button', { name: 'Phong cách: Đường phố' })).toBeVisible();

  await bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('a red shirt on a hanger');
  const [sent] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/jobs') && r.request().method() === 'POST'),
    bar.getByRole('button', { name: /^Tạo ảnh/ }).click(),
  ]);
  expect(sent.status()).toBe(201);
  expect(sent.request().postDataJSON()).toMatchObject({ feature: 'image', modelId: 'mock-image-e2e', prompt: 'a red shirt on a hanger', presetId: 'style-street' });
  const { id } = (await sent.json()) as { id: string };
  const job = (await (await page.request.get(`/api/jobs/${id}`)).json()) as { presetId: string; prompt: string; brief: string };
  expect(job.presetId).toBe('style-street');
  expect(job.brief).toBe('a red shirt on a hanger');
  expect(job.prompt).toMatch(/^a red shirt on a hanger\s+Urban street scene/); // the style follows the member's words

  // Reuse fills the member's words and the style back, not the composed prompt.
  await page.goto(`/image-generation?reuse=${id}`);
  await expect(page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' })).toHaveValue('a red shirt on a hanger');
  await expect(page.getByRole('group', { name: 'Thanh tạo ảnh' }).getByRole('button', { name: 'Phong cách: Đường phố' })).toBeVisible();
});

test('a template editor renames a style in the picker, and the picker shows and picks it under the new label', async ({ page }) => {
  await signIn(page, 'tpled');
  const grid = await openStyles(page);
  await grid.getByRole('button', { name: 'Sửa phong cách Phẳng nằm', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Sửa phong cách' });
  await expect(form.getByLabel('Mô tả phong cách (tiếng Anh)')).toHaveValue(/^Flat lay shot/); // an editor reads the prompt it edits
  await expect(form.getByRole('button', { name: 'Gợi ý prompt từ video' })).toHaveCount(0); // a style has no clip to read
  await expect(form.getByLabel('Thay video mẫu (MP4)')).toHaveCount(0);
  await expect(form.getByLabel('Thay ảnh ví dụ (JPG)')).toBeVisible();
  await form.getByLabel('Tên phong cách').fill('Phẳng nằm (sửa)');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/presets/style-flat-lay') && r.request().method() === 'PATCH' && r.ok()), form.getByRole('button', { name: 'Lưu', exact: true }).click()]);
  await expect(form).toBeHidden();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã lưu phong cách.')).toBeVisible();
  await grid.getByRole('button', { name: 'Phẳng nằm (sửa)', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Thanh tạo ảnh' }).getByRole('button', { name: 'Phong cách: Phẳng nằm (sửa)' })).toBeVisible();
  expect((await page.request.patch('/api/presets/style-flat-lay', { data: { label: 'Phẳng nằm' } })).ok()).toBe(true);
});

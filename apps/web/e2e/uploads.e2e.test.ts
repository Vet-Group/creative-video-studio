import { expect, test } from '@playwright/test';
import { modelButton, pickPreset, png, signIn } from './support.test';

test('a photo uploaded on Image Generation is offered by "Ảnh đã tải" on Create and Try On, and a pick fills the form as an upload would', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'uploadsa');
  const name = `reuse-${Date.now()}.png`; // a retry finds the first try's photo too, under another name
  await page.goto('/image-generation');
  await expect(page.getByLabel('Ảnh tham chiếu', { exact: true })).toBeEnabled(); // files set before hydration are dropped
  await page.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles({ name, mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('img', { name })).toBeVisible();

  await page.goto('/create');
  const open = page.getByRole('button', { name: 'Ảnh đã tải', exact: true });
  await expect(open).toBeEnabled();
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Ảnh đã tải' });
  await dialog.getByRole('button', { name: `Dùng ${name}` }).click();
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused(); // the dialog hands focus back
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img', { name })).toBeVisible();
  // A photo already in the form is not offered twice: a job takes each input once.
  await open.click();
  await expect(dialog.getByText('Ảnh bạn đã tải lên ở mọi trang, mới nhất trước.').or(dialog.getByText(/^Chưa có ảnh nào khác/))).toBeVisible();
  await expect(dialog.getByRole('button', { name: `Dùng ${name}` })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await pickPreset(page, 'gentle-push-in');
  await expect(modelButton(page)).toContainText('Mock E2E');
  const run = page.getByRole('button', { name: 'Tạo video' });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();

  // Try On: the model slot's own link fills its one photo.
  await page.goto('/try-on');
  const model = page.getByRole('button', { name: 'Ảnh đã tải cho Người mẫu' });
  await expect(model).toBeEnabled();
  await model.click();
  await page.getByRole('dialog', { name: 'Ảnh đã tải' }).getByRole('button', { name: `Dùng ${name}` }).click();
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name })).toBeVisible();

  // Marketing Studio: a half-width slot keeps its height; its link sits in the box's corner and still fills the slot.
  await page.goto('/marketing-studio');
  const product = page.getByRole('button', { name: 'Ảnh đã tải cho Sản phẩm' });
  await expect(product).toBeEnabled();
  await product.click();
  await page.getByRole('dialog', { name: 'Ảnh đã tải' }).getByRole('button', { name: `Dùng ${name}` }).click();
  await expect(page.getByLabel('Sản phẩm: ảnh đã chọn').getByRole('img', { name })).toBeVisible();
  await expect(product).toBeVisible(); // still over the filled photo, to swap it

  // Image Generation: the bar's tile beside the upload one.
  await page.goto('/image-generation');
  const bar = page.getByRole('button', { name: 'Ảnh đã tải', exact: true });
  await expect(bar).toBeEnabled();
  await bar.click();
  await page.getByRole('dialog', { name: 'Ảnh đã tải' }).getByRole('button', { name: `Dùng ${name}` }).click();
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img', { name })).toBeVisible();
});

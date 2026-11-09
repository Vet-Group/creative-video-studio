import { expect, test } from '@playwright/test';
import { modelButton, pickPreset, png, selectText, signIn } from './support.test';

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
  await expect(dialog.getByText('Ảnh bạn đã tải lên ở mọi trang, mỗi ảnh một lần, mới nhất trước.').or(dialog.getByText(/^Chưa có ảnh nào khác/))).toBeVisible();
  await expect(dialog.getByRole('button', { name: `Dùng ${name}` })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await pickPreset(page, 'gentle-push-in');
  await expect(modelButton(page)).toContainText('Mock E2E');
  const run = page.getByRole('button', { name: 'Tạo video' });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();

  // Try On: the model slot's own link fills its one photo.
  await page.goto('/try-on');
  const model = page.getByRole('button', { name: 'Ảnh đã tải cho Người mẫu' });
  await expect(model).toBeEnabled();
  await model.click();
  // The picker opens on its slot's photos; the Image Generation upload is one pick of "Tất cả mục" away.
  await expect(page.getByRole('dialog', { name: 'Ảnh đã tải' }).getByText('Chưa có ảnh người mẫu nào khác. Chọn "Tất cả mục" để xem mọi ảnh.')).toBeVisible();
  await selectText(page, 'Lọc theo mục', 'Tất cả mục');
  await page.getByRole('dialog', { name: 'Ảnh đã tải' }).getByRole('button', { name: `Dùng ${name}` }).click();
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name })).toBeVisible();

  // Marketing Studio: a half-width slot keeps its height; its link sits in the box's corner and still fills the slot.
  await page.goto('/marketing-studio');
  const product = page.getByRole('button', { name: 'Ảnh đã tải cho Sản phẩm' });
  await expect(product).toBeEnabled();
  await product.click();
  await selectText(page, 'Lọc theo mục', 'Tất cả mục');
  await page.getByRole('dialog', { name: 'Ảnh đã tải' }).getByRole('button', { name: `Dùng ${name}` }).click();
  await expect(page.getByLabel('Sản phẩm: ảnh đã chọn').getByRole('img', { name })).toBeVisible();
  await expect(product).toBeVisible(); // still over the filled photo, to swap it

  // Image Generation: the reference slot's own link; it opens on Marketing's reference photos (the slot of its label), every photo one pick away.
  await page.goto('/image-generation');
  const refs = page.getByRole('button', { name: 'Ảnh đã tải cho Ảnh tham chiếu' });
  await expect(refs).toBeEnabled();
  await refs.click();
  await selectText(page, 'Lọc theo mục', 'Tất cả mục');
  await page.getByRole('dialog', { name: 'Ảnh đã tải' }).getByRole('button', { name: `Dùng ${name}` }).click();
  await expect(page.getByLabel('Ảnh tham chiếu: ảnh đã chọn').getByRole('img', { name })).toBeVisible();
});

test('an upload carries the store chosen on its page, and the picker opens on the page store with every store one pick away', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'uploadsb');
  const store = 'Cửa hàng/Thương hiệu';
  const [onA, onB] = [`store-a-${Date.now()}.png`, `store-b-${Date.now()}.png`]; // a retry finds the first try's photos too, under other names
  // Create with store A (signIn leaves the form hydrated).
  await selectText(page, store, 'E2E Shop');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: onA, mimeType: 'image/png', buffer: png() });
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img', { name: onA })).toBeVisible();

  // Image Generation with store B, from the store picker above the tabs.
  await page.goto('/image-generation');
  await expect(page.getByLabel('Ảnh tham chiếu', { exact: true })).toBeEnabled();
  await selectText(page, store, 'E2E Brand Shop');
  await page.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles({ name: onB, mimeType: 'image/png', buffer: png() });
  await expect(page.getByLabel('Ảnh tham chiếu: ảnh đã chọn').getByRole('img', { name: onB })).toBeVisible();

  // Back on Create with store A: the picker shows A's photo only, and "Tất cả cửa hàng" shows both.
  await page.goto('/create');
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  await selectText(page, store, 'E2E Shop');
  const open = page.getByRole('button', { name: 'Ảnh đã tải', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Ảnh đã tải' });
  const filter = dialog.getByRole('combobox', { name: 'Lọc theo cửa hàng' });
  await expect(filter).toHaveText('E2E Shop');
  await expect(dialog.getByRole('button', { name: `Dùng ${onA}` })).toBeVisible();
  await expect(dialog.getByRole('button', { name: `Dùng ${onB}` })).toHaveCount(0);
  await filter.click();
  await dialog.getByRole('option', { name: 'Tất cả cửa hàng' }).click();
  await expect(filter).toHaveText('Tất cả cửa hàng');
  await expect(filter).toBeFocused(); // a pick keeps focus on the filter, inside the dialog
  await expect(dialog.getByRole('button', { name: `Dùng ${onA}` })).toBeVisible();
  await expect(dialog.getByRole('button', { name: `Dùng ${onB}` })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});

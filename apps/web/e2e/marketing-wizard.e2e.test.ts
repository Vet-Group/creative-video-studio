import { expect, type Page, test } from '@playwright/test';
import { png, signIn } from './support.test';

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const steps = (page: Page) => page.locator('.wizard-steps');
const nextButton = (page: Page) => page.getByRole('button', { name: 'Tiếp tục' });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });

test('the Marketing Studio guided wizard walks format → photos → content → settings, gates Tiếp tục on the required photos, and the full-mode toggle shows the whole form at once', async ({ page }) => {
  await signIn(page, 'mkta');
  await nav(page).getByRole('link', { name: 'Marketing Studio' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  // A team with no landing of its own gets the full form: no step list, the Run button shows.
  await expect(runButton(page)).toBeVisible();
  await expect(steps(page)).toHaveCount(0);

  // Turn the guided wizard on: the four steps appear and only the first, the format step, is on show.
  await page.getByRole('button', { name: 'Chuyển sang chế độ hướng dẫn' }).click();
  await expect(steps(page)).toBeVisible();
  await expect(steps(page).getByRole('listitem')).toHaveCount(4);
  await expect(page.locator('.app-head strong')).toBeVisible(); // the format banner
  await expect(page.getByLabel('Ảnh người mẫu')).toHaveCount(0); // the photo step is not reached yet
  await expect(runButton(page)).toHaveCount(0); // Run is replaced by the Next button
  await nextButton(page).click();

  // Step 2 photos: the photo slots show (the file inputs behind them are hidden by design), and Next stays disabled until the model and product photos are in.
  await expect(page.locator('.marketing-slots')).toBeVisible();
  await expect(nextButton(page)).toBeDisabled();
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(nextButton(page)).toBeEnabled();
  await nextButton(page).click();

  // Step 3 content: the photo slots are gone, Back is offered; UGC needs no words, so move on.
  await expect(page.locator('.marketing-slots')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Quay lại' })).toBeVisible();
  await nextButton(page).click();

  // Step 4 settings: the Run button is back and there is no Next past the last step.
  await expect(runButton(page)).toBeVisible();
  await expect(nextButton(page)).toHaveCount(0);

  // Switching to the full mode shows every part of the form at once, with no step list.
  await page.getByRole('button', { name: 'Chuyển sang chế độ đầy đủ' }).click();
  await expect(steps(page)).toHaveCount(0);
  await expect(page.locator('.app-head strong')).toBeVisible();
  await expect(page.locator('.marketing-slots')).toBeVisible();
  await expect(runButton(page)).toBeVisible();
});

import { expect, type Page, test } from '@playwright/test';
import { png, signIn } from './support.test';

// The pre-flight photo check under an upload slot (lib/photo-check.ts): a small or dark photo gets a warning line, a good one none, and the Run stays allowed.
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy(?! lại)/ });
const slot = (page: Page) => page.getByRole('group', { name: 'Sản phẩm', exact: true });
const note = (page: Page) => page.getByRole('status').filter({ hasText: /^Lưu ý: / });

/** A side × side PNG of one grey level, drawn in the page. */
const flat = (page: Page, side: number, grey: number) =>
  page.evaluate(
    ([side, grey]) => {
      const c = document.createElement('canvas');
      [c.width, c.height] = [side, side];
      const x = c.getContext('2d')!;
      x.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
      x.fillRect(0, 0, side, side);
      return c.toDataURL('image/png').split(',')[1]!;
    },
    [side, grey] as const,
  );

test('photo check: a small photo and a dark one get a warning under the slot, a good one none, and Run stays enabled', async ({ page }) => {
  await signIn(page, 'photochk');
  await page.goto('/apps/hook-effects');
  const file = page.getByLabel('Ảnh sản phẩm', { exact: true });

  await file.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: png() });
  await expect(slot(page).getByRole('img', { name: 'tiny.png' })).toBeVisible();
  await expect(note(page)).toHaveText('Lưu ý: ảnh nhỏ (8×8 px) nên kết quả có thể mờ, hãy dùng ảnh có cạnh ngắn từ 768 px.');
  await expect(runButton(page)).toBeEnabled();

  await slot(page).getByRole('button', { name: 'Bỏ ảnh tiny.png' }).click();
  await file.setInputFiles({ name: 'good.png', mimeType: 'image/png', buffer: Buffer.from(await flat(page, 800, 235), 'base64') });
  await expect(slot(page).getByRole('img', { name: 'good.png' })).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
  await expect(note(page)).toHaveCount(0);

  await slot(page).getByRole('button', { name: 'Bỏ ảnh good.png' }).click();
  await file.setInputFiles({ name: 'dark.png', mimeType: 'image/png', buffer: Buffer.from(await flat(page, 800, 20), 'base64') });
  await expect(note(page)).toHaveText('Lưu ý: ảnh tối nên dễ mất chi tiết, hãy tăng sáng hoặc chụp lại.');
  await expect(runButton(page)).toBeEnabled();
});

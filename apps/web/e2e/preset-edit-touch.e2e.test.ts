import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// A touch laptop: a mouse that hovers plus a touch screen. Playwright's hasTouch would also turn hover off, so Chrome's own pointer settings stand in for
// the hardware; they take a browser of their own, hence a spec of its own.
test.use({ launchOptions: { args: ['--blink-settings=primaryPointerType=4,primaryHoverType=2,availablePointerTypes=6,availableHoverTypes=3'] } });

test("on a touch laptop a card's edit chip is a pencil that shows without a hover, since a tap picks the card at once", async ({ page }) => {
  await signIn(page, 'tplprop');
  await page.goto('/create');
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (any-pointer: coarse)').matches)).toBe(true);
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  const pencil = page.getByRole('list', { name: 'Danh sách mẫu' }).getByRole('button', { name: 'Đề xuất sửa mẫu Lia vòng sang trái', exact: true });
  await page.mouse.move(0, 0);
  await expect(pencil).toHaveCSS('opacity', '1');
  await expect(pencil.getByText('Đề xuất sửa', { exact: true })).toBeHidden();
  await expect(pencil.locator('svg.icon')).toBeVisible();
  expect(await pencil.evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])).toEqual([24, 24]);
});

import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// Playwright's Chromium hides scroll bars by default; desktop Chrome on Windows shows them, and that is where the owner pressed one (2026-11-03).
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test("a press on the form's scroll bar keeps an open list; the reading stays until Dịch, Escape or new words, and a click elsewhere still closes the suggestions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 }); // short, so the form column scrolls
  await signIn(page, 'sugga');
  await page.goto('/create');
  await page.getByLabel('Mô tả chuyển động').fill('slow turn in window light');
  const form = page.locator('.form-scroll');
  const bar = await form.evaluate((e: HTMLElement) => ({ w: e.offsetWidth - e.clientWidth, scrolls: e.scrollHeight > e.clientHeight }));
  expect(bar.scrolls).toBe(true);
  expect(bar.w).toBeGreaterThan(0);
  const onBar = async () => {
    const f = (await form.boundingBox())!;
    await page.mouse.click(f.x + f.width - Math.ceil(bar.w / 2) - 2, f.y + f.height / 2);
  };
  const outside = () => page.getByText('Mô tả chuyển động', { exact: true }).click(); // the field's label, outside the tools

  await page.getByRole('button', { name: 'Dịch', exact: true }).click();
  const reading = page.getByRole('group', { name: 'Bản dịch tiếng Việt' });
  await expect(reading.getByText('Translation: slow turn in window light')).toBeVisible({ timeout: 20_000 });
  await onBar();
  await expect(reading).toBeVisible();
  await outside();
  await expect(reading).toBeVisible(); // a reading aid, kept while the member works on the form
  await page.keyboard.press('Escape');
  await expect(reading).toHaveCount(0);

  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  const list = page.getByRole('group', { name: 'Gợi ý AI' });
  await expect(list.getByRole('button', { name: /^Gợi ý 1/ })).toBeVisible({ timeout: 20_000 });
  await onBar();
  await expect(list).toBeVisible();
  await outside();
  await expect(list).toHaveCount(0);
});

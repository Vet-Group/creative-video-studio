import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

const columns = (page: Page) => page.locator('.masonry-col');
const slider = (page: Page) => page.getByLabel('Cỡ ô');

/** Moves the Examples slider to its smallest and largest stop: the column count follows, and the stop survives a reload. */
async function checkExamples(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Ví dụ', exact: true }).click();
  await expect(slider(page)).toHaveValue('1');
  await expect(columns(page)).toHaveCount(3);
  await slider(page).fill('0');
  await expect(columns(page)).toHaveCount(4);
  await slider(page).fill('2');
  await expect(columns(page)).toHaveCount(2);
  await page.reload();
  await page.getByRole('tab', { name: 'Ví dụ', exact: true }).click();
  await expect(slider(page)).toHaveValue('2');
  await expect(columns(page)).toHaveCount(2);
  await slider(page).fill('1');
  await expect(columns(page)).toHaveCount(3);
}

/** The History slider has two stops: one column of cards (the default) and two. */
async function checkHistory(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(slider(page)).toHaveValue('1');
  await slider(page).fill('0');
  await expect(page.locator('.side.history-small')).toHaveCount(1);
  await expect.poll(() => page.locator('.tray.history ul').evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').length)).toBe(2);
  await page.reload();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(slider(page)).toHaveValue('0');
  await slider(page).fill('1');
  await expect(page.locator('.side.history-small')).toHaveCount(0);
  await expect.poll(() => page.locator('.tray.history ul').evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').length)).toBe(1);
}

test('the size slider sets the Examples columns and the History layout on Create Videos and Marketing Studio, and is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Without an uploaded sample or a company clip the Marketing gallery shows only its empty text, so one sample tile is added.
  await page.route('**/api/samples', async (r) => r.fulfill({ json: { samples: [...((await (await r.fetch()).json()) as { samples: { name: string }[] }).samples, { name: 'marketing-example-1.mp4', bytes: 1 }] } }));
  await signIn(page, 'sizea');
  await checkExamples(page);
  await checkHistory(page);
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Marketing Studio' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  await checkExamples(page);
  await checkHistory(page);
  // Below 1024 px the columns are fixed and the slider is gone.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(slider(page)).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' }); // a samples call still in flight at the end would fail the test once the page closes
});

import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

// The satisfaction rating: a member with three succeeded real jobs (seeded in serve.ts) is asked in a card that never blocks the page, sends or
// snoozes it, and an Admin reads the scores on the Overview. Order matters: the last test reads what the first one sent.

const card = (page: Page) => page.getByRole('complementary', { name: 'Chấm điểm Creative Video Studio' });

test('a member with three succeeded jobs sees the card, sends 9 with a comment, and the card hides for good', async ({ page }) => {
  await signIn(page, 'ratea');
  await page.goto('/explore');
  const c = card(page);
  await expect(c.getByText('Bạn chấm Creative Video Studio mấy điểm?')).toBeVisible();
  await expect(c.getByRole('radio')).toHaveCount(10);
  await expect(c.getByLabel('Điều gì sẽ giúp bạn chấm cao hơn?')).toBeHidden(); // the comment box opens with the first score
  await expect(c.getByRole('button', { name: 'Gửi' })).toBeDisabled();
  await c.getByRole('radio', { name: '9 điểm', exact: true }).check();
  await c.getByLabel('Điều gì sẽ giúp bạn chấm cao hơn?').fill('  Nhanh hơn tôi nghĩ  ');
  await c.getByRole('button', { name: 'Gửi' }).click();
  await expect(c.getByText('Cảm ơn bạn!')).toBeVisible();
  await expect(c).toBeHidden();
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(card(page)).toBeHidden();
});

test('"Để sau" hides the card and keeps it away on the next visit', async ({ page }) => {
  await signIn(page, 'rateb');
  await page.goto('/explore');
  await expect(card(page)).toBeVisible();
  const snoozed = page.waitForResponse((r) => r.url().endsWith('/api/rating/snooze') && r.ok());
  await card(page).getByRole('button', { name: 'Để sau' }).click();
  await expect(card(page)).toBeHidden();
  await snoozed;
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(card(page)).toBeHidden();
});

test('on a 390px phone the card is a full-width bottom sheet and the scores work from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'ratec');
  await page.goto('/explore');
  const c = card(page);
  await expect(c).toBeVisible();
  const box = (await c.boundingBox())!;
  expect(box.x).toBeCloseTo(0, 0);
  expect(box.width).toBeCloseTo(390, 0);
  expect(box.y + box.height).toBeCloseTo(844, 0);
  expect(box.height).toBeLessThan(300); // it must not cover the page
  await c.getByRole('radio', { name: '1 điểm', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(c.getByRole('radio', { name: '2 điểm', exact: true })).toBeChecked();
  // Scrolled to the end of a page, its last control (Create's Run button) must clear the sheet, so the member never has to answer first.
  await page.goto('/create');
  await expect(card(page)).toBeVisible();
  const run = page.getByRole('main').getByRole('button', { name: /^Tạo video/ });
  await expect(run).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await run.boundingBox())!.y + (await run.boundingBox())!.height).toBeLessThanOrEqual((await card(page).boundingBox())!.y);
});

test('a member can always rate from the Feedback page', async ({ page }) => {
  await signIn(page, 'rated'); // no succeeded real jobs: no card
  await page.goto('/feedback');
  await expect(card(page)).toBeHidden();
  const block = page.getByRole('region', { name: 'Chấm điểm app' });
  await block.getByRole('radio', { name: '7 điểm', exact: true }).check();
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/rating') && r.request().method() === 'POST' && r.status() === 201);
  await block.getByRole('button', { name: 'Gửi' }).click();
  await sent;
  await expect(block.getByText('Cảm ơn bạn!')).toBeVisible();
});

test('an Admin reads the scores in "Điểm hài lòng" on the Overview', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/overview');
  const section = page.getByRole('region', { name: 'Điểm hài lòng' });
  await expect(section.getByText('Nhanh hơn tôi nghĩ')).toBeVisible();
  await expect(section.locator('strong', { hasText: '9/10' })).toBeVisible();
  await expect(section.getByRole('group', { name: 'Điểm hài lòng' })).toContainText('Điểm trung bình');
  await expect(section.getByRole('table', { name: 'Điểm hài lòng theo nhóm' }).getByRole('row')).not.toHaveCount(1); // the header and at least one team
});

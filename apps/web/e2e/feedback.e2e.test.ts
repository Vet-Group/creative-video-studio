// The feedback board and an item page: the team's reply keeps its formatting, the Admin's comments are marked, the board shows replies,
// excerpts and the mine-only filter, and the Admin's reply box previews and confirms a save.
import { type Browser, expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

const REPLY = 'Cảm ơn bạn đã góp ý. Đã xong:\n1. Thêm 17 mẫu cho hàng POD.\n2. Xem thêm tại https://video.vetgroup.net/create.\n\nCách dùng: **chọn mẫu khác** rồi bấm Tạo video.';

/** A board item posted through the API by whoever is signed in on `page`; returns its id. */
async function postItem(page: Page, title: string, body: string): Promise<string> {
  const res = await page.request.post('/api/feedback', { data: { kind: 'feature', title, body } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Signs the Admin in on a page of its own, runs `work`, then closes it. */
async function asAdmin(browser: Browser, work: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, 'admin');
    await work(page);
  } finally {
    await context.close();
  }
}

test('the reply keeps paragraphs, a numbered list, bold and links; the steps and the team comment are marked; the board shows the reply, the excerpt and "Chỉ của tôi"', async ({ page, browser }) => {
  await signIn(page, 'member6');
  const title = `Mẫu cho sản phẩm khác ${Date.now()}`;
  const id = await postItem(page, title, 'Cần thêm mẫu cho cốc và chăn.\nDòng thứ hai.');
  const other = `Góp ý của Admin ${Date.now()}`;
  await asAdmin(browser, async (admin) => {
    expect((await admin.request.patch(`/api/admin/feedback/${id}`, { data: { status: 'done', adminNote: REPLY } })).ok()).toBe(true);
    expect((await admin.request.post(`/api/feedback/${id}/comments`, { data: { body: 'Đã thêm, bạn thử nhé.' } })).ok()).toBe(true);
    await postItem(admin, other, 'Một góp ý không phải của thành viên.');
  });

  await page.goto(`/feedback/${id}`);
  const reply = page.getByRole('region', { name: 'Phản hồi từ đội kỹ thuật' });
  await expect(reply.locator('p')).toHaveText(['Cảm ơn bạn đã góp ý. Đã xong:', 'Cách dùng: chọn mẫu khác rồi bấm Tạo video.']);
  await expect(reply.locator('ol > li')).toHaveText(['Thêm 17 mẫu cho hàng POD.', 'Xem thêm tại https://video.vetgroup.net/create.']);
  await expect(reply.getByRole('link', { name: 'https://video.vetgroup.net/create' })).toHaveAttribute('href', 'https://video.vetgroup.net/create');
  await expect(reply.locator('strong')).toHaveText('chọn mẫu khác');
  await expect(reply).toContainText('Cập nhật');
  await expect(page.getByRole('list', { name: 'Tiến độ xử lý' }).locator('[aria-current="step"]')).toHaveText('Đã xử lý');
  await expect(page.locator('.fb-card .fb-text br')).toHaveCount(1);
  const comment = page.locator('.fb-comments li').filter({ hasText: 'Đã thêm, bạn thử nhé.' });
  await expect(comment).toHaveClass(/by-team/);
  await expect(comment).toContainText('Đội kỹ thuật');
  await expect(page.getByRole('group', { name: 'Xử lý (Admin)' })).toHaveCount(0);

  await page.goto('/feedback');
  const row = page.locator('.fb-item').filter({ hasText: title });
  await expect(row).toContainText('Đã phản hồi');
  await expect(row.locator('.fb-excerpt')).toHaveText('Cần thêm mẫu cho cốc và chăn.\nDòng thứ hai.');
  await expect(page.locator('.fb-item').filter({ hasText: other })).toBeVisible();
  await page.getByLabel('Chỉ của tôi').check();
  await expect(page.locator('.fb-item').filter({ hasText: title })).toBeVisible();
  await expect(page.locator('.fb-item').filter({ hasText: other })).toHaveCount(0);
  await page.getByLabel('Chỉ của tôi').uncheck();
  await page.getByRole('searchbox').fill('cốc và chăn');
  await expect(page.locator('.fb-item').filter({ hasText: title })).toBeVisible();
  await expect(page.locator('.fb-item').filter({ hasText: other })).toHaveCount(0);
});

test("the Admin's reply box previews the formatting, saves only a change and confirms it", async ({ page, browser }) => {
  await signIn(page, 'member6');
  const id = await postItem(page, `Báo lỗi xem trước ${Date.now()}`, 'Nút bị lệch.');
  await asAdmin(browser, async (admin) => {
    await admin.goto(`/feedback/${id}`);
    const box = admin.getByRole('group', { name: 'Xử lý (Admin)' });
    const save = box.getByRole('button', { name: 'Lưu' });
    await expect(save).toBeDisabled();
    await box.getByLabel('Phản hồi cho người gửi').fill('Đã sửa:\n- Nút thẳng hàng\n- Thêm kiểm tra');
    await box.getByRole('button', { name: 'Xem trước' }).click();
    await expect(box.getByLabel('Xem trước phản hồi').locator('ul > li')).toHaveText(['Nút thẳng hàng', 'Thêm kiểm tra']);
    await box.getByRole('button', { name: 'Sửa' }).click();
    await box.getByLabel('Trạng thái').selectOption('done');
    await save.click();
    await expect(box.getByRole('status')).toHaveText('Đã lưu.');
    await expect(save).toBeDisabled();
    await expect(admin.getByRole('region', { name: 'Phản hồi từ đội kỹ thuật' }).locator('ul > li')).toHaveText(['Nút thẳng hàng', 'Thêm kiểm tra']);
  });
});

test('at 390 px the top bar says "Góp ý" and the item page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member6');
  const longLink = `https://video.vetgroup.net/${'a'.repeat(120)}`;
  const id = await postItem(page, `Trên điện thoại ${Date.now()}`, ['Một link dài', longLink, 'để thử xuống dòng.'].join(' '));
  await page.goto(`/feedback/${id}`);
  await expect(page.locator('.topbar strong')).toHaveText('Góp ý');
  await expect(page.locator('.fb-card h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

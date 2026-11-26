import { expect, type Locator, type Page, test } from '@playwright/test';
import { clearMyJobs, openTab, png, runViaApi, signIn } from './support.test';

// A pointer extra over the click: a photo dragged from History onto a form slot does what a click on it does, in the role the slot gives it.
const up = async (page: Page, name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
const note = (page: Page, text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
/** Holds the pointer over `target` mid-drag (a drag needs a few moves to start and to reach a target), so what shows over it can be read before the drop. */
const holdOver = async (page: Page, source: Locator, target: Locator) => {
  await source.hover();
  await page.mouse.down();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 4, { steps: 3 });
};
const historyCard = (page: Page, text: string) => page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: text });

test('Image Generation: a History input and result drag onto the reference slot, which lights up for them and ends as a click does', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'draga');
  await clearMyJobs(page);
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [await up(page, 'drag-1.png'), await up(page, 'drag-2.png')], ratio: '1:1', prompt: 'drag shot', enhance: false, params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);
  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  const card = historyCard(page, 'drag shot');
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  const slot = page.locator('.slot');
  const chosen = page.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' });
  const thumb = card.getByRole('list', { name: 'Ảnh đầu vào' }).getByRole('listitem').nth(1).locator('img'); // its button's name changes once the form has the photo

  // Over the slot the file-drop highlight shows; away from it, it goes.
  await expect(slot).toHaveAttribute('data-over', 'false');
  await holdOver(page, thumb, slot);
  await expect(slot).toHaveAttribute('data-over', 'true');
  await page.mouse.up();
  await expect(slot).toHaveAttribute('data-over', 'false');
  await expect(chosen.getByRole('img', { name: 'drag-2.png' })).toBeVisible();
  await expect(note(page, 'Đã thêm ảnh vào đầu vào')).toBeVisible(); // the click's own note

  // The photo is in the form now: the click's rule, one copy, holds for a drop.
  await thumb.dragTo(slot);
  await expect(note(page, 'Ảnh này đã có trong biểu mẫu')).toBeVisible();
  await expect(chosen.getByRole('img')).toHaveCount(1);

  // The card's result is a source too.
  await card.getByRole('img', { name: 'Tạo ảnh' }).dragTo(slot);
  await expect(chosen.getByRole('img')).toHaveCount(2);
});

test('Try On: the slot decides the role, so a person photo dropped on Trang phục is a garment', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'dragb');
  await clearMyJobs(page);
  const res = await page.request.post('/api/jobs', { data: { feature: 'try_on', modelId: 'mock-image-e2e', assetIds: [await up(page, 'drag-person.png'), await up(page, 'drag-garment.png')], ratio: '3:4', prompt: '', enhance: false, params: { resolution: '1K', garments: '1' } } });
  expect(res.status()).toBe(201);
  await page.goto('/try-on');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').first();
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  const person = card.getByRole('button', { name: 'Ảnh đầu vào 1: dùng làm người mẫu', exact: true }).locator('img');

  await person.dragTo(page.getByRole('group', { name: 'Trang phục' }));
  await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img', { name: 'drag-person.png' })).toBeVisible();
  await expect(note(page, 'Đã thêm trang phục')).toBeVisible();
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn')).toHaveCount(0);

  // The result goes to the model slot, as Use Result does, when it is dropped there.
  await card.getByRole('img', { name: /Thử đồ/ }).dragTo(page.getByRole('group', { name: 'Người mẫu' }));
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveCount(1);
  await expect(note(page, 'Đã dùng ảnh người mẫu')).toBeVisible();

  // A slot that is full is no target: nothing lights up and nothing is added.
  const model = page.getByRole('group', { name: 'Người mẫu' });
  const other = card.getByRole('button', { name: 'Ảnh đầu vào 2: dùng làm trang phục', exact: true }).locator('img');
  await holdOver(page, other, model);
  await expect(model).toHaveAttribute('data-over', 'false');
  await page.mouse.up();
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveCount(1);
});

test('Create video: a History photo dropped on the photo box is added as a click adds it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'dragc');
  await clearMyJobs(page);
  await runViaApi(page);
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const clip = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').first();
  await expect(clip.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img')).toHaveCount(0);
  await clip.getByRole('list', { name: 'Ảnh đầu vào' }).locator('img').dragTo(page.locator('.dropzone'));
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img')).toHaveCount(1);
  await expect(note(page, 'Đã thêm ảnh tham chiếu')).toBeVisible();
});

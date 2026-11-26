import { expect, type Locator, type Page, test } from '@playwright/test';
import { clearMyJobs, modelButton, pickModel, pickPreset, png, signIn } from './support.test';

// The shelf link (ShelfPicker) beside the uploaded-photos link: on Create's drop zone, Try On's garments, Image Generation's reference strip, Marketing's product slot and the
// multi-angle app's slot, a pick puts the saved photo in the slot and a Run sends that asset id; model and background slots, Motion Control and Media Optimizer have no such link.
// The member `shelfpick` owns every product here. Image runs use the mock image model (`mock-image-e2e`), not the video model, which other specs share.
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const shelfLink = (scope: Page | Locator, name = 'Từ kệ sản phẩm') => scope.getByRole('button', { name, exact: true });
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Kệ sản phẩm' });
const jobPost = (page: Page) => page.waitForResponse((r) => new URL(r.url()).pathname === '/api/jobs' && r.request().method() === 'POST');

/** Saves a product of two fresh photos through the API; returns its photos' names and ids. */
async function seed(page: Page, name: string): Promise<{ names: string[]; ids: string[]; product: string }> {
  const stamp = Date.now();
  const names = [`${name}-front-${stamp}.png`, `${name}-back-${stamp}.png`];
  const ids: string[] = [];
  for (const n of names) {
    const up = await page.request.post('/api/assets', { multipart: { file: file(n) } });
    expect(up.status()).toBe(201);
    ids.push(((await up.json()) as { assets: { id: string }[] }).assets[0]!.id);
  }
  const product = `${name} ${stamp}`;
  expect((await page.request.post('/api/products', { data: { name: product, assetIds: ids } })).status()).toBe(201);
  return { names, ids, product };
}

/** Opens the link's dialog, picks the photo by its label and waits for the dialog to close and hand focus back. */
async function pick(page: Page, link: Locator, photo: string, product: string) {
  await expect(link).toBeEnabled(); // files and picks before hydration are dropped
  await link.click();
  const dialog = dialogOf(page);
  await expect(dialog.getByRole('heading', { name: product })).toBeVisible();
  await dialog.getByRole('button', { name: `Dùng ${photo} của ${product}` }).click();
  await expect(dialog).toBeHidden();
  await expect(link).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await signIn(page, 'shelfpick');
});

test('Create: the shelf link fills the drop zone, offers each photo once, and Run sends the picked asset id', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { names, ids, product } = await seed(page, 'Kệ Create');
  await page.goto('/create');
  const link = shelfLink(page);
  await expect(page.getByRole('button', { name: 'Ảnh đã tải', exact: true })).toBeVisible(); // beside it
  await pick(page, link, names[0]!, product);
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img', { name: names[0]! })).toBeVisible();
  // A photo already in the form is not offered twice, and the product's other photo still is.
  await link.click();
  await expect(dialogOf(page).getByRole('button', { name: `Dùng ${names[0]!} của ${product}` })).toHaveCount(0);
  await expect(dialogOf(page).getByRole('button', { name: `Dùng ${names[1]!} của ${product}` })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toBeHidden();

  await pickPreset(page, 'gentle-push-in');
  await expect(modelButton(page)).toContainText('Mock E2E');
  const [sent] = await Promise.all([jobPost(page), page.getByRole('button', { name: 'Tạo video' }).click()]);
  expect(sent.status()).toBe(201);
  expect(sent.request().postDataJSON()).toMatchObject({ assetIds: [ids[0]] });
  await clearMyJobs(page);
});

test('Try On: the garments slot has the link and a Run on the mock image model sends the picked garment after the person', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { names, ids, product } = await seed(page, 'Kệ Thử đồ');
  await page.goto('/try-on');
  await expect(page.getByLabel('Ảnh trang phục')).toBeEnabled();
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  await pick(page, shelfLink(page, 'Từ kệ sản phẩm cho Trang phục'), names[1]!, product);
  await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img', { name: names[1]! })).toBeVisible();
  await expect(modelButton(page)).toContainText('Mock image E2E');
  const [sent] = await Promise.all([jobPost(page), page.getByRole('button', { name: /^Thử đồ/ }).click()]);
  expect(sent.status()).toBe(201);
  const body = sent.request().postDataJSON() as { assetIds: string[]; modelId: string };
  expect(body.modelId).toBe('mock-image-e2e');
  expect(body.assetIds).toHaveLength(2);
  expect(body.assetIds[1]).toBe(ids[1]); // person, then garment
  await clearMyJobs(page);
});

test('Image Generation: the reference strip keeps its link as an icon named in full, and a Run on the mock image model sends the picked photo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { names, ids, product } = await seed(page, 'Kệ Tạo ảnh');
  await page.goto('/image-generation');
  const bar = page.locator('.imagebar');
  const link = shelfLink(bar, 'Từ kệ sản phẩm cho Ảnh tham chiếu');
  await expect(link).toHaveAttribute('title', 'Từ kệ sản phẩm cho Ảnh tham chiếu');
  await expect(link.locator('.shelf-text')).toHaveCSS('clip-path', 'inset(50%)'); // the words are hidden in the strip's head, the name stays
  await pick(page, link, names[0]!, product);
  await expect(bar.getByLabel('Ảnh tham chiếu: ảnh đã chọn').getByRole('img', { name: names[0]! })).toBeVisible();
  await bar.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen shirt on a wooden chair');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  const [sent] = await Promise.all([jobPost(page), bar.getByRole('button', { name: /^Tạo ảnh/ }).click()]);
  expect(sent.status()).toBe(201);
  expect(sent.request().postDataJSON()).toMatchObject({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [ids[0]] });
  await clearMyJobs(page);
});

test('Marketing Studio: the product slot has the link and a Run sends the model photo, then the picked product photo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { names, ids, product } = await seed(page, 'Kệ Marketing');
  await page.goto('/marketing-studio');
  await expect(page.getByLabel('Ảnh người mẫu')).toBeEnabled();
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(page.getByRole('img', { name: 'model.png' })).toBeVisible();
  await pick(page, shelfLink(page, 'Từ kệ sản phẩm cho Sản phẩm'), names[0]!, product);
  await expect(page.getByLabel('Sản phẩm: ảnh đã chọn').getByRole('img', { name: names[0]! })).toBeVisible();
  await expect(shelfLink(page, 'Từ kệ sản phẩm cho Sản phẩm')).toBeVisible(); // still over the filled photo, to swap it
  const [sent] = await Promise.all([jobPost(page), page.getByRole('button', { name: /^Tạo video/ }).click()]);
  expect(sent.status()).toBe(201);
  const { assetIds } = sent.request().postDataJSON() as { assetIds: string[] };
  expect(assetIds).toHaveLength(2);
  expect(assetIds[1]).toBe(ids[0]);
  await clearMyJobs(page);
});

test('the multi-angle app: its photo slot has the link, and every view of the Run sends the picked photo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { names, ids, product } = await seed(page, 'Kệ Nhiều góc');
  await page.goto('/apps/multi-angle');
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  await pick(page, shelfLink(page, 'Từ kệ sản phẩm cho Sản phẩm'), names[1]!, product);
  await expect(page.getByRole('group', { name: 'Sản phẩm' }).getByRole('img', { name: names[1]! })).toBeVisible();
  await pickModel(page, /Mock angles E2E/);
  const posted: { assetIds: string[] }[] = [];
  const statuses: number[] = [];
  page.on('response', (r) => {
    if (new URL(r.url()).pathname !== '/api/jobs' || r.request().method() !== 'POST') return;
    posted.push(r.request().postDataJSON() as { assetIds: string[] });
    statuses.push(r.status());
  });
  await page.getByRole('button', { name: /^Chạy/ }).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect.poll(() => posted.length).toBe(3); // the back and both sides, the app's default views
  expect(statuses).toEqual([201, 201, 201]);
  for (const p of posted) expect(p.assetIds).toEqual([ids[1]]);
  await clearMyJobs(page);
});

test('model and background slots, Motion Control and Media Optimizer have no shelf link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const anyShelf = page.getByRole('button', { name: /^Từ kệ sản phẩm/ });
  await page.goto('/try-on');
  await expect(page.getByRole('button', { name: 'Ảnh đã tải cho Người mẫu' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Ảnh đã tải cho Bối cảnh (tuỳ chọn)' }).or(page.getByRole('button', { name: 'Ảnh đã tải cho Bối cảnh' }))).toBeVisible();
  await expect(shelfLink(page, 'Từ kệ sản phẩm cho Trang phục')).toBeVisible();
  await expect(anyShelf).toHaveCount(1); // the garments' link only
  await page.goto('/marketing-studio');
  await expect(page.getByRole('button', { name: 'Ảnh đã tải cho Người mẫu' })).toBeEnabled();
  await expect(shelfLink(page, 'Từ kệ sản phẩm cho Người mẫu')).toHaveCount(0);
  await expect(shelfLink(page, 'Từ kệ sản phẩm cho Sản phẩm')).toBeVisible();
  for (const [path, label] of [['/apps/motion-control', 'Ảnh nhân vật'], ['/apps/media-optimizer', 'Ảnh cần tối ưu']] as const) {
    await page.goto(path);
    await expect(page.getByLabel(label)).toBeAttached();
    await expect(anyShelf, path).toHaveCount(0);
  }
});

// At 390 px a link takes a 44 px tap through its ::after; on a filled slot that box must stay clear of every photo's remove button, or a tap meant for the link deletes the photo.
test('on a filled slot at 390 px no link takes a tap over a photo\'s remove button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overlaps = (field: Locator) =>
    field.evaluate((el) => {
      const rect = (e: Element) => e.getBoundingClientRect();
      const hit = (l: Element) => {
        const r = rect(l), after = getComputedStyle(l, '::after');
        const [w, h] = [parseFloat(after.width) || r.width, parseFloat(after.height) || r.height];
        return { left: r.x + r.width / 2 - w / 2, right: r.x + r.width / 2 + w / 2, top: r.y + r.height / 2 - h / 2, bottom: r.y + r.height / 2 + h / 2 };
      };
      const links = [...el.querySelectorAll('.uploads-link')].filter((l) => !l.closest('dialog'));
      const removes = [...el.querySelectorAll('.slot-thumbs button')].map(rect);
      return links.flatMap((l) => removes.filter((b) => hit(l).left < b.right && b.left < hit(l).right && hit(l).top < b.bottom && b.top < hit(l).bottom).map(() => l.getAttribute('aria-label')));
    });
  for (const [path, input, group] of [['/apps/multi-angle', 'Ảnh sản phẩm', 'Sản phẩm'], ['/apps/background-remover', 'Ảnh cần xoá nền', 'Ảnh'], ['/try-on', 'Ảnh trang phục', 'Trang phục']] as const) {
    await page.goto(path);
    await expect(page.getByLabel(input)).toBeEnabled();
    await page.getByLabel(input).setInputFiles(Array.from({ length: path === '/try-on' ? 2 : 1 }, (_, i) => file(`${group}-${i}.png`)));
    const slot = page.getByRole('group', { name: group, exact: true });
    await expect(slot.getByRole('img').first()).toBeVisible();
    await expect(shelfLink(page, `Từ kệ sản phẩm cho ${group}`)).toBeVisible();
    expect(await overlaps(page.locator('.field').filter({ has: slot })), path).toEqual([]);
  }
});

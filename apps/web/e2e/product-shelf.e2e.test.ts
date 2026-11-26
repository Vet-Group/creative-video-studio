import { expect, type Locator, type Page, test } from '@playwright/test';
import { png, runViaApi, signIn } from './support.test';

// The product shelf (the Library's Products view): its pill, the add, rename, duplicate-name and delete steps of its form, the "create more angles" link, and a Library that makes no clip
// request while the shelf shows. The member `shelf` owns every product here.
const pills = (page: Page) => page.getByRole('group', { name: 'Loại' }).getByRole('button');
const shelfPill = (page: Page) => pills(page).filter({ hasText: /^Sản phẩm$/ });
const view = (page: Page) => page.locator('.product-shelf');
const form = (page: Page) => page.getByRole('dialog', { name: /sản phẩm$/ });
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
/** Opens the select of `scope` with this label and picks the option with this text (the page has two store selects: the filter and the form's). */
async function choose(scope: Locator, label: string, text: string) {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  await scope.getByRole('listbox', { name: label, exact: true }).getByRole('option').getByText(text, { exact: true }).click();
}
const filter = (page: Page) => page.getByRole('group', { name: 'Lọc sản phẩm' });
const myProducts = async (page: Page) => ((await (await page.request.get('/api/products')).json()) as { products: { id: string; name: string }[] }).products;

/** Opens the add form, fills it and saves; `extra` runs before the save button (a store, a type). */
async function addProduct(page: Page, name: string, files: string[], extra?: () => Promise<void>) {
  await view(page).getByRole('button', { name: 'Thêm sản phẩm' }).click();
  const dialog = form(page);
  await expect(dialog.getByRole('heading', { name: 'Thêm sản phẩm' })).toBeVisible();
  await dialog.getByLabel('Tên sản phẩm').fill(name);
  await expect(dialog.getByRole('button', { name: 'Lưu' })).toBeDisabled(); // a name alone is not enough
  await dialog.locator('input[type=file][aria-label="Ảnh sản phẩm"]').setInputFiles(files.map(file));
  await expect(dialog.getByRole('list', { name: 'Ảnh sản phẩm: ảnh đã chọn' }).getByRole('img')).toHaveCount(files.length);
  await extra?.();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await signIn(page, 'shelf');
  await page.goto('/library');
  await expect(pills(page).first()).toBeVisible();
});

test('"Sản phẩm" is the last pill; choosing it clears the search and filters, hides the clip tools and makes no clip request, and a reload keeps the view', async ({ page }) => {
  await expect(pills(page).last()).toHaveText('Sản phẩm');
  await page.getByPlaceholder('Tìm theo mô tả hoặc mô hình').fill('abc');
  await pills(page).filter({ hasText: /^Tất cả ảnh$/ }).click();
  await expect(page).toHaveURL(/q=abc&kind=images/); // the search box is applied after its debounce; its request is the previous view's, not the shelf's
  await page.waitForLoadState('networkidle');
  const clipRequests: string[] = [];
  page.on('request', (r) => r.url().includes('/api/library') && clipRequests.push(r.url()));
  await expect(async () => {
    await shelfPill(page).click();
    await expect(shelfPill(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass();
  await expect(page).toHaveURL(/\/library\?kind=products$/); // no search text and no other filter in the address
  await expect(view(page)).toBeVisible();
  await expect(page.getByPlaceholder('Tìm theo mô tả hoặc mô hình')).toBeHidden();
  for (const name of ['Sắp xếp', 'Kiểu xem', 'Cỡ ô', 'Bộ lọc']) await expect(page.getByLabel(name)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chọn', exact: true })).toHaveCount(0);
  await expect(page.locator('.library-active')).toHaveCount(0);
  await expect(page.locator('.library-skeleton')).toHaveCount(0);
  await expect(page.getByText('Chưa có sản phẩm nào. Bấm Thêm sản phẩm', { exact: false })).toBeVisible();

  // A finished job makes the tray reload the Library; with the shelf showing it does not.
  await runViaApi(page);
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.every((j) => j.status === 'succeeded'), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(clipRequests).toEqual([]);

  await page.reload();
  await expect(shelfPill(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page)).toBeVisible();
  // Back to the clips: the pills and the tools come back, and the clips load.
  await pills(page).first().click();
  await expect(page.getByPlaceholder('Tìm theo mô tả hoặc mô hình')).toBeVisible();
  await expect(view(page)).toHaveCount(0);
  await expect(page.getByRole('article').first()).toBeVisible();
  await clearJobs(page);
});

/** Deletes the finished jobs this member made, so the next test starts with an empty Library. */
async function clearJobs(page: Page) {
  const jobs = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs;
  for (const j of jobs) if (j.status === 'succeeded') await page.request.delete(`/api/jobs/${j.id}`);
}

test('a direct visit to /library?kind=products shows no clip loading state, and a clip answer still in flight from the previous pill never renders', async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { loadingSeen: seen });
    new MutationObserver(() => {
      if (/Đang tải\.\.\./.test(document.body?.innerText ?? '')) seen.push('Đang tải...');
      if (document.querySelector('.library-skeleton')) seen.push('skeleton');
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto('/library?kind=products');
  await expect(view(page)).toBeVisible();
  await expect(shelfPill(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Đang tải...', { exact: true })).toHaveCount(0);
  await expect(page.locator('.library-skeleton')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { loadingSeen: string[] }).loadingSeen)).toEqual([]);

  // A slow /api/library answer for the clips pill arrives after the shelf pill was chosen: it must not show clips.
  await page.route('**/api/library?**', async (route) => {
    await new Promise((done) => setTimeout(done, 2_500));
    await route.continue();
  });
  await page.goto('/library?kind=images');
  await expect(async () => {
    await shelfPill(page).click();
    await expect(shelfPill(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass();
  await page.waitForTimeout(4_000);
  await expect(view(page)).toBeVisible();
  await expect(page.locator('.library-days')).toBeHidden();
  await expect(page.locator('.library-empty')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('adds a product from two photos, a store and a type, renames it, refuses a duplicate name, opens Tạo thêm góc on its first photo and deletes it', async ({ page }) => {
  await shelfPill(page).click();
  await expect(view(page)).toBeVisible();
  const dialog = await addProduct(page, 'Áo thun mèo', ['front.png', 'back.png'], async () => {
    await choose(form(page), 'Cửa hàng', 'E2E Shop');
    await choose(form(page), 'Loại sản phẩm', 'Áo thun');
  });
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(dialog).toBeHidden();
  const card = view(page).getByRole('listitem').filter({ hasText: 'Áo thun mèo' });
  await expect(card).toHaveCount(1);
  await expect(card.getByText('E2E Shop · Áo thun')).toBeVisible();
  await expect(card.getByRole('img')).toHaveCount(2);

  // Rename: the card shows the new name.
  await card.getByRole('button', { name: 'Sửa Áo thun mèo' }).click();
  const edit = form(page);
  await expect(edit.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();
  await expect(edit.getByLabel('Tên sản phẩm')).toHaveValue('Áo thun mèo');
  await edit.getByLabel('Tên sản phẩm').fill('Áo thun mèo đen');
  await edit.getByRole('button', { name: 'Lưu' }).click();
  await expect(edit).toBeHidden();
  const renamed = view(page).getByRole('listitem').filter({ hasText: 'Áo thun mèo đen' });
  await expect(renamed).toHaveCount(1);
  await expect(view(page).getByRole('listitem')).toHaveCount(1);

  // A second product with the same name in other letters is refused with its line, and nothing is added.
  const again = await addProduct(page, 'ÁO THUN MÈO ĐEN', ['x.png', 'y.png']);
  await again.getByRole('button', { name: 'Lưu' }).click();
  await expect(again.getByRole('alert')).toHaveText('Đã có sản phẩm tên này.');
  await again.getByRole('button', { name: 'Huỷ' }).click();
  await expect(again).toBeHidden();
  await expect(view(page).getByRole('listitem')).toHaveCount(1);

  // Tạo thêm góc opens the multi-angle app with the first photo in its Sản phẩm slot.
  const first = (await myProducts(page))[0]!;
  const detail = (await (await page.request.get('/api/products')).json()) as { products: { photos: { id: string; filename: string }[] }[] };
  const href = await renamed.getByRole('link', { name: /^Tạo thêm góc/ }).getAttribute('href');
  expect(href).toBe(`/apps/multi-angle?image=${detail.products[0]!.photos[0]!.id}`);
  await renamed.getByRole('link', { name: /^Tạo thêm góc/ }).click();
  await expect(page).toHaveURL(/\/apps\/multi-angle\?image=/);
  await expect(page.getByRole('group', { name: 'Sản phẩm' }).getByRole('img', { name: detail.products[0]!.photos[0]!.filename })).toBeVisible();

  // Delete asks first, says the photos stay, and removes the card.
  await page.goto('/library?kind=products');
  await expect(renamed).toHaveCount(1);
  await renamed.getByRole('button', { name: 'Xoá Áo thun mèo đen' }).click();
  const ask = page.getByRole('dialog', { name: 'Xoá sản phẩm này?' });
  await expect(ask).toContainText('Ảnh của sản phẩm không bị xoá.');
  await ask.getByRole('button', { name: 'Huỷ' }).click();
  await expect(renamed).toHaveCount(1);
  await renamed.getByRole('button', { name: 'Xoá Áo thun mèo đen' }).click();
  await page.getByRole('dialog', { name: 'Xoá sản phẩm này?' }).getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(renamed).toHaveCount(0);
  expect(await myProducts(page)).toEqual([]);
  expect(first.name).toBe('Áo thun mèo đen');
});

test('the store filter lists a store’s products only, and an empty one points back at all stores', async ({ page }) => {
  const up = async (name: string) => {
    const r = await page.request.post('/api/assets', { multipart: { file: file(name) } });
    expect(r.status()).toBe(201);
    return ((await r.json()) as { assets: { id: string }[] }).assets[0]!.id;
  };
  const ids = [await up('f1.png'), await up('f2.png')];
  expect((await page.request.post('/api/products', { data: { name: 'Có cửa hàng', storeId: 'store-e2e', assetIds: ids } })).status()).toBe(201);
  expect((await page.request.post('/api/products', { data: { name: 'Không cửa hàng', assetIds: ids } })).status()).toBe(201);
  try {
    await shelfPill(page).click();
    await expect(view(page).getByRole('listitem')).toHaveCount(2);
    await choose(filter(page), 'Cửa hàng', 'E2E Shop');
    await expect(view(page).getByRole('listitem')).toHaveCount(1);
    await expect(view(page).getByRole('heading', { name: 'Có cửa hàng' })).toBeVisible();
    await choose(filter(page), 'Cửa hàng', 'E2E Brand Shop');
    await expect(view(page).getByText('Chưa có sản phẩm nào của cửa hàng này.', { exact: false })).toBeVisible();
  } finally {
    for (const p of await myProducts(page)) await page.request.delete(`/api/products/${p.id}`);
  }
});

test('the 101st product is refused with its own line', async ({ page }) => {
  const up = await page.request.post('/api/assets', { multipart: { file: file('limit-a.png') } });
  const up2 = await page.request.post('/api/assets', { multipart: { file: file('limit-b.png') } });
  const assetIds = [...((await up.json()) as { assets: { id: string }[] }).assets, ...((await up2.json()) as { assets: { id: string }[] }).assets].map((a) => a.id);
  for (let n = 1; n <= 100; n++) expect((await page.request.post('/api/products', { data: { name: `Mẫu ${n}`, assetIds } })).status(), `product ${n}`).toBe(201);
  try {
    await shelfPill(page).click();
    const dialog = await addProduct(page, 'Mẫu thứ 101', ['over-a.png', 'over-b.png']);
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Bạn đã có 100 sản phẩm. Hãy xoá bớt trước khi thêm.');
  } finally {
    for (const p of await myProducts(page)) await page.request.delete(`/api/products/${p.id}`);
  }
});

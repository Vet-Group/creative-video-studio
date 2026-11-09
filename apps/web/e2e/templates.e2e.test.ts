import { expect, type Page, test } from '@playwright/test';
import { addExamples, openTemplates, png, select, selectText, signIn } from './support.test';

// Saved forms: Save template keeps the page's inputs under a name, My templates reopens the page filled from one. Only the store template is run, on the mock model.
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });

async function saveAs(page: Page, name: string) {
  await page.getByRole('button', { name: 'Lưu thiết lập', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lưu thiết lập' });
  await dialog.getByLabel('Tên thiết lập').fill(name);
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu thiết lập.' })).toBeVisible();
}

test('on every form the template links scroll with the fields, and the fixed bar below holds only Run, as on the live page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'tplpos');
  for (const path of ['/create', '/try-on', '/image-generation', '/marketing-studio', '/apps/character-swap']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Lưu thiết lập', exact: true })).toBeVisible();
    await expect(page.locator('.form-scroll > .templates'), path).toHaveCount(1);
    await expect(page.locator('.runbar').getByRole('button'), path).toHaveCount(1);
  }
});

test('Try On: a saved template lists under Thiết lập đã lưu and refills the person, garment, text and resolution; another member does not see it; it can be deleted', async ({ page, browser }) => {
  await signIn(page, 'tpla');
  await page.goto('/try-on');
  await page.getByLabel('Ảnh trang phục').setInputFiles(file('garment.png'));
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  await expect(page.getByRole('img', { name: 'person.png' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' }).fill('red dress');
  await select(page, 'Độ phân giải').click();
  await page.getByRole('option', { name: '2K' }).click();
  await saveAs(page, 'Váy đỏ');

  await page.goto('/try-on');
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue('');
  await openTemplates(page);
  const list = page.getByRole('dialog', { name: 'Thiết lập đã lưu' });
  const link = list.getByRole('link', { name: 'Váy đỏ' });
  const url = new URL((await link.getAttribute('href'))!, page.url()).href; // the template link, for another member below
  await link.click();
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'person.png');
  await expect(page).toHaveURL((u) => u.pathname === '/try-on' && u.search === ''); // the link opened the refill, then the address drops its query
  await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'garment.png');
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue('red dress');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Sẵn sàng tạo lại')).toHaveCount(0); // a saved template is not a recreate

  // Another member: not in the list, and the link refills nothing.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'tplb');
  await other.goto('/try-on');
  await openTemplates(other);
  await expect(other.getByRole('dialog', { name: 'Thiết lập đã lưu' })).toContainText('Chưa có thiết lập nào.');
  await other.goto(url);
  await expect(other.getByText('Không tìm thấy ảnh để dùng lại.')).toBeVisible();
  await other.close();

  await openTemplates(page);
  await list.getByRole('button', { name: 'Xoá thiết lập Váy đỏ' }).click();
  await page.getByRole('dialog', { name: 'Xoá thiết lập "Váy đỏ"?' }).getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(list).toContainText('Chưa có thiết lập nào.');
});

test("Create: a template saved to the store chosen on the form is listed, tagged with the store, to another member who picks that store, and applies there with the author's photo, which that member's Run takes", async ({ page, browser }) => {
  await signIn(page, 'stpla');
  await page.goto('/create');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('shop-bag.png'));
  await expect(page.getByRole('img', { name: 'shop-bag.png' })).toBeVisible();
  await page.getByLabel('Mô tả chuyển động').fill('The shop bag spins slowly.');
  await page.getByRole('button', { name: 'Lưu thiết lập', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lưu thiết lập' });
  await expect(dialog.getByRole('radio', { name: 'Cửa hàng', exact: true })).toBeDisabled(); // no store chosen on the form yet
  await expect(dialog.getByRole('radio', { name: 'Công ty' })).toHaveCount(0); // a member shares with no company
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await selectText(page, 'Cửa hàng/Thương hiệu', 'E2E Shop');
  await page.getByRole('button', { name: 'Lưu thiết lập', exact: true }).click();
  await dialog.getByLabel('Tên thiết lập').fill('Túi xoay');
  await dialog.getByRole('radio', { name: 'Cửa hàng E2E Shop' }).check();
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu thiết lập.' })).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'stplb');
  await other.goto('/create');
  const list = other.getByRole('dialog', { name: 'Thiết lập đã lưu' });
  await openTemplates(other);
  await expect(list).toContainText('Chưa có thiết lập nào.'); // without the store, not listed
  await list.getByRole('button', { name: 'Đóng' }).click();
  await selectText(other, 'Cửa hàng/Thương hiệu', 'E2E Shop');
  await openTemplates(other);
  const item = list.getByRole('listitem').filter({ hasText: 'Túi xoay' });
  await expect(item.locator('.tag')).toHaveText('Cửa hàng: E2E Shop');
  await expect(item.getByRole('button', { name: 'Xoá thiết lập Túi xoay' })).toHaveCount(0); // only its author, an Admin or an editor deletes it
  await item.getByRole('link', { name: 'Túi xoay' }).click();
  await expect(other.getByLabel('Mô tả chuyển động')).toHaveValue('The shop bag spins slowly.');
  await expect(select(other, 'Cửa hàng/Thương hiệu')).toHaveText('E2E Shop');
  // The author's photo comes as this member's own copy, so the preview shows and the Run (the mock model) takes it.
  const photo = other.getByRole('img', { name: 'shop-bag.png' });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0); // the copy's bytes load
  await expect(other.getByRole('button', { name: /^Mô hình / })).toContainText('Mock E2E');
  const run = other.getByRole('button', { name: /^Tạo video/ });
  await expect(run).toBeEnabled();
  const created = other.waitForResponse((r) => r.url().endsWith('/api/jobs') && r.request().method() === 'POST');
  await run.click();
  expect((await created).status()).toBe(201);
  await other.close();

  // The author deletes it, so no other spec that picks this store lists it.
  await openTemplates(page);
  await page.getByRole('dialog', { name: 'Thiết lập đã lưu' }).getByRole('button', { name: 'Xoá thiết lập Túi xoay' }).click();
  await page.getByRole('dialog', { name: 'Xoá thiết lập "Túi xoay"?' }).getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Thiết lập đã lưu' })).toContainText('Chưa có thiết lập nào.');
});

test('Image Generation: a saved template refills the prompt and Enhance', async ({ page }) => {
  await signIn(page, 'tpla');
  await page.goto('/image-generation');
  const prompt = page.getByRole('textbox', { name: 'Mô tả', exact: true });
  await prompt.fill('a studio shot');
  await saveAs(page, 'Studio');
  await page.goto('/image-generation');
  await expect(prompt).toHaveValue('');
  await openTemplates(page);
  await page.getByRole('dialog', { name: 'Thiết lập đã lưu' }).getByRole('link', { name: 'Studio' }).click();
  await expect(prompt).toHaveValue('a studio shot');
});

test('Marketing Studio: an Advanced template chosen on the UGC page opens the Advanced page with its references, brief and script', async ({ page }) => {
  await signIn(page, 'tplb');
  const refs: string[] = [];
  for (const name of ['ref-1.png', 'ref-2.png']) {
    const res = await page.request.post('/api/assets', { multipart: { file: file(name) } });
    refs.push(((await res.json()) as { assets: { id: string }[] }).assets[0]!.id);
  }
  const saved = await page.request.post('/api/templates', { data: { feature: 'marketing', name: 'Launch', data: { images: refs, format: 'advanced', brief: 'my brief', script: 'my lines', audio: 'on' } } });
  expect(saved.status()).toBe(201);
  await page.goto('/marketing-studio');
  await openTemplates(page);
  await page.getByRole('dialog', { name: 'Thiết lập đã lưu' }).getByRole('link', { name: 'Launch' }).click();
  await expect(page.getByLabel('Ảnh tham chiếu: ảnh đã chọn').getByRole('img')).toHaveCount(2);
  await expect(page).toHaveURL((u) => u.pathname === '/marketing-studio/advanced' && u.search === ''); // the link opened the refill, then the address drops its query
  await expect(page.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('my brief');
  await expect(page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' })).toHaveValue('my lines');
});

test('Dùng ví dụ này on a company result in Ví dụ fills Try On, Image Generation and Marketing Studio from its inputs, for another member too; an Explore image model opens Image Generation on that model', async ({ page, browser }) => {
  await signIn(page, 'usea');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: file(name) } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const post = async (data: Record<string, unknown>) => {
    const res = await page.request.post('/api/jobs', { data });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const [person, garment] = [await up('use-person.png'), await up('use-garment.png')];
  const ids = {
    try_on: await post({ feature: 'try_on', modelId: 'mock-image-e2e', assetIds: [person, garment], ratio: '3:4', prompt: 'composed', params: { resolution: '1K', garments: '1', brief: 'blue coat' } }),
    image: await post({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [garment], ratio: '1:1', prompt: 'a flat lay', enhance: false, params: { resolution: '1K' } }),
    marketing: await post({ feature: 'marketing', modelId: 'mock-e2e', assetIds: [person, garment], ratio: '1:1', durationSec: 5, prompt: 'composed', params: { audio: 'off' } }),
  };
  const done = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => Object.values(ids).includes(j.id) && j.status === 'succeeded').length;
  await expect.poll(done, { timeout: 60_000 }).toBe(3);
  await addExamples(browser, Object.values(ids)); // the Examples tab lists a result only once an Admin put it there

  // Another member uses them: the inputs of a Library result are open to every member.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'useb');
  const use = (id: string) => other.locator(`.gallery-use[data-from="/api/jobs/${id}"]`);

  await other.goto('/try-on');
  await other.getByRole('tab', { name: 'Ví dụ' }).click();
  await use(ids.try_on).click();
  await expect(other).toHaveURL((u) => u.pathname === '/try-on' && u.search === ''); // in place, as Fash's Recreate
  await expect(other.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'use-person.png');
  await expect(other.getByLabel('Trang phục: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'use-garment.png');
  await expect(other.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue('blue coat'); // a result's words are open to every member too (owner, 2026-11-03)

  await other.goto('/image-generation');
  await use(ids.image).click();
  await expect(other.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('a flat lay');
  await expect(other.getByRole('img', { name: 'use-garment.png' })).toBeVisible();

  await other.goto('/marketing-studio');
  await use(ids.marketing).click();
  await expect(other).toHaveURL((u) => u.pathname === '/marketing-studio' && u.search === '');
  await expect(other.getByRole('img', { name: 'use-person.png' })).toBeVisible();

  await other.goto('/explore');
  await other.getByRole('list', { name: 'Mô hình' }).getByRole('link', { name: /Mock image Solo/ }).click();
  await expect(other).toHaveURL(/\/image-generation\?model=mock-image-solo$/);
  await expect(other.getByRole('button', { name: /^Mô hình / })).toContainText('Mock image Solo');
  await other.close();
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { HOOKS } from '../src/lib/marketing';
import { png, signIn } from './support.test';

// A member's own hooks and locations on Marketing Studio, Save template from a History card, and the often-used group. Runs use the mock models only.
// Every company hook made here is deleted in `finally`: marketing.e2e.test.ts counts HOOKS.length cards.
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const hookBox = (page: Page) => page.getByRole('button', { name: /^Hook/ });
const locationBox = (page: Page) => page.getByRole('button', { name: /^Bối cảnh/ });
const history = (page: Page) => page.getByRole('complementary', { name: 'Job của tôi' });
const unique = () => Date.now().toString(36); // a retry makes new items, so names never clash with the first attempt's

async function upload(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/assets', { multipart: { file: file(name) } });
  return ((await res.json()) as { assets: { id: string }[] }).assets[0]!.id;
}
async function post(page: Page, data: Record<string, unknown>): Promise<string> {
  const res = await page.request.post('/api/jobs', { data });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
async function addChoice(page: Page, data: Record<string, unknown>): Promise<string> {
  const res = await page.request.post('/api/choices', { data });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
/** Deletes the member's jobs once they are done, so the shared Library the later specs filter (flow.e2e.test.ts) holds none of them. */
test.afterEach(async ({ page }) => {
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs?: { id: string; status: string }[] }).jobs ?? [];
  await expect.poll(async () => (await mine()).every((j) => !['queued', 'submitting', 'running'].includes(j.status)), { timeout: 60_000 }).toBe(true);
  for (const j of await mine()) if (j.status === 'succeeded') expect((await page.request.delete(`/api/jobs/${j.id}`)).ok()).toBe(true);
});

async function asAdmin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, 'admin');
  return page;
}

test('the add form says what a hook is, an example fills it, a Vietnamese scene gets a hint, and the share box sits by its words', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'custa');
  await page.goto('/marketing-studio');
  await hookBox(page).click();
  const hooks = page.getByRole('dialog', { name: 'Chọn hook' });
  // The variants row belongs to the picking, so it sits under the cards, above the add link.
  const variantsY = (await hooks.getByText(/^Tạo nhiều biến thể/).boundingBox())!.y;
  expect(variantsY).toBeLessThan((await hooks.getByRole('button', { name: 'Thêm hook' }).boundingBox())!.y);
  await hooks.getByRole('button', { name: 'Thêm hook' }).click();
  const form = hooks.getByRole('group', { name: 'Thêm hook' });
  await expect(form).toContainText('Hook là 1-2 giây mở đầu clip');
  await expect(form.getByLabel('Tên', { exact: true })).toBeFocused();
  await form.getByRole('group', { name: 'Điền thử một ví dụ' }).getByRole('button', { name: 'Trước và sau' }).click();
  await expect(form.getByLabel('Tên', { exact: true })).toHaveValue('Trước và sau');
  await expect(form.getByLabel('Mô tả ngắn (tuỳ chọn)')).toHaveValue(/bộ đồ mới/);
  const scene = form.getByLabel('Cảnh cho AI (tiếng Anh)');
  await expect(scene).toHaveValue(/^The clip opens with the creator in a plain old outfit/);
  await expect(scene).toHaveAccessibleDescription(/tiếng Anh tốt nhất/);
  await scene.fill('Cô gái mở hộp quà');
  await expect(scene).toHaveAccessibleDescription(/Có vẻ đây là tiếng Việt/);
  await expect(form.getByRole('checkbox')).toHaveCount(0); // only an Admin shares

  const admin = await asAdmin(browser);
  try {
    await admin.setViewportSize({ width: 1440, height: 1000 });
    await admin.goto('/marketing-studio');
    await hookBox(admin).click();
    const dialog = admin.getByRole('dialog', { name: 'Chọn hook' });
    await dialog.getByRole('button', { name: 'Thêm hook' }).click();
    const box = (await dialog.getByRole('checkbox', { name: 'Chia sẻ cho cả công ty' }).boundingBox())!;
    const label = (await dialog.locator('label.template-share').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(20);
    expect(box.x - label.x).toBeLessThan(4);
  } finally {
    await admin.context().close();
  }
});

test('Thêm hook and Thêm bối cảnh save the member’s own, choose them at once, put their phrases in the prompt, and Dùng lại brings them back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const tag = unique();
  const hook = { name: `Vẫy tay ${tag}`, phrase: `The creator waves at the camera ${tag}.` };
  const spot = { name: `Quán quen ${tag}`, phrase: `a small corner cafe ${tag}` };
  await signIn(page, 'custa');
  await page.goto('/marketing-studio');
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(page.getByRole('img', { name: 'model.png' })).toBeVisible();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();

  await hookBox(page).click();
  const hooks = page.getByRole('dialog', { name: 'Chọn hook' });
  await hooks.getByRole('button', { name: 'Thêm hook' }).click();
  const hookForm = hooks.getByRole('group', { name: 'Thêm hook' });
  await hookForm.getByLabel('Tên', { exact: true }).fill(hook.name);
  await hookForm.getByLabel('Cảnh cho AI (tiếng Anh)').fill(hook.phrase);
  await hookForm.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(hooks).toBeHidden();
  await expect(hookBox(page)).toContainText(hook.name);
  await hookBox(page).click();
  await expect(hooks.getByRole('option', { name: hook.name, exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(hooks.getByRole('region', { name: 'Hook của bạn' }).getByRole('button', { name: `Xoá hook ${hook.name}` })).toBeVisible();
  await page.keyboard.press('Escape');

  await locationBox(page).click();
  const places = page.getByRole('dialog', { name: 'Chọn bối cảnh' });
  await places.getByRole('button', { name: 'Thêm bối cảnh' }).click();
  const spotForm = places.getByRole('group', { name: 'Thêm bối cảnh' });
  await spotForm.getByLabel('Tên', { exact: true }).fill(spot.name);
  await spotForm.getByLabel('Cảnh cho AI (tiếng Anh)').fill(spot.phrase);
  await spotForm.getByLabel('Mô tả ngắn (tuỳ chọn)').fill('Góc quán quen');
  await spotForm.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(places).toBeHidden();
  await expect(locationBox(page)).toContainText(spot.name);

  await page.getByText('Xem prompt gửi đi').click();
  const preview = page.locator('.prompt-preview p');
  await expect(preview).toContainText(`${hook.phrase} Set in ${spot.phrase}.`);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });

  // A fresh page refilled from History has the same choices and the same prompt.
  await page.goto('/marketing-studio');
  await expect(hookBox(page)).toContainText('Chưa chọn');
  await history(page).getByRole('button', { name: 'Dùng lại' }).first().click();
  await expect(hookBox(page)).toContainText(hook.name);
  await expect(locationBox(page)).toContainText(spot.name);
  await page.getByText('Xem prompt gửi đi').click();
  await expect(preview).toContainText(`${hook.phrase} Set in ${spot.phrase}.`);
});

test("another member does not see a private hook; an Admin's company hook shows for every member, without Xoá", async ({ page, browser }) => {
  const tag = unique();
  await signIn(page, 'custa');
  const privateName = `Riêng ${tag}`;
  await addChoice(page, { kind: 'hook', name: privateName, phrase: 'Private words.' });
  const admin = await asAdmin(browser);
  const companyName = `Công ty ${tag}`;
  const company = await addChoice(admin, { kind: 'hook', name: companyName, phrase: 'Company words.', isCompany: true });
  try {
    const other = await (await browser.newContext()).newPage();
    await signIn(other, 'custb');
    await other.goto('/marketing-studio');
    await hookBox(other).click();
    const hooks = other.getByRole('dialog', { name: 'Chọn hook' });
    await expect(hooks.getByRole('option', { name: companyName, exact: true })).toBeVisible();
    await expect(hooks.getByRole('option', { name: privateName, exact: true })).toHaveCount(0);
    await expect(hooks.getByRole('button', { name: /^Xoá hook / })).toHaveCount(0);
    await expect(hooks.getByRole('region', { name: 'Hook của bạn' })).toHaveCount(0);
    // The owner, and an Admin for a company one, may delete; another member may not.
    expect((await other.request.delete(`/api/choices/${company}`)).status()).toBe(404);
    await other.close();
  } finally {
    expect((await admin.request.delete(`/api/choices/${company}`)).status()).toBe(204);
    await admin.close();
  }
});

test('Lưu mẫu on a History card saves that job as a template of its page, which Mẫu của tôi lists and refills, on Try On and on Marketing Studio', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const tag = unique();
  await signIn(page, 'custa');
  const [person, garment] = [await upload(page, 'cust-person.png'), await upload(page, 'cust-garment.png')];
  await post(page, { feature: 'try_on', modelId: 'mock-image-e2e', assetIds: [person, garment], ratio: '3:4', prompt: 'composed', params: { resolution: '2K', garments: '1', brief: 'blue coat' } });
  await post(page, { feature: 'marketing', modelId: 'mock-e2e', assetIds: [person, garment], ratio: '9:16', durationSec: 5, prompt: 'composed', params: { audio: 'off', hook: HOOKS[0]!.id, brief: 'tpl brief' } });

  async function saveFromCard(name: string) {
    await page.getByRole('tab', { name: 'Lịch sử' }).click();
    const card = history(page).locator('.job-card').first();
    await card.getByRole('button', { name: /^Lưu mẫu từ / }).click();
    const dialog = page.getByRole('dialog', { name: 'Lưu mẫu' });
    await expect(dialog.getByLabel('Tên mẫu')).not.toHaveValue(''); // the card's title to start with
    await dialog.getByLabel('Tên mẫu').fill(name);
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByRole('status')).toHaveText('Đã lưu mẫu.');
  }
  async function openTemplate(path: RegExp, name: string) {
    await page.getByRole('button', { name: 'Mẫu của tôi' }).click();
    await page.getByRole('dialog', { name: 'Mẫu của tôi' }).getByRole('link', { name }).click();
    await expect(page).toHaveURL(path);
  }

  await page.goto('/try-on');
  await saveFromCard(`Áo xanh ${tag}`);
  await page.goto('/try-on');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('');
  await openTemplate(/\/try-on\?template=/, `Áo xanh ${tag}`);
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'cust-person.png');
  await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'cust-garment.png');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('blue coat');

  await page.goto('/marketing-studio');
  await saveFromCard(`Bão ${tag}`);
  await page.goto('/marketing-studio');
  await openTemplate(/\/marketing-studio\?template=/, `Bão ${tag}`);
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('tpl brief');
  await expect(hookBox(page)).toContainText(HOOKS[0]!.name);
  await expect(page.getByRole('img', { name: 'cust-person.png' })).toBeVisible();
});

test('after two Runs with the same hook its picker has a Hay dùng group holding it; a member with no history has none', async ({ page, browser }) => {
  const hook = HOOKS.find((h) => h.id === 'product-drop')!;
  await signIn(page, 'custa');
  const [person, product] = [await upload(page, 'often-person.png'), await upload(page, 'often-product.png')];
  for (let i = 0; i < 2; i++) await post(page, { feature: 'marketing', modelId: 'mock-e2e', assetIds: [person, product], ratio: '9:16', durationSec: 5, prompt: 'composed', params: { audio: 'off', hook: hook.id } });
  await page.goto('/marketing-studio');
  await hookBox(page).click();
  const hooks = page.getByRole('dialog', { name: 'Chọn hook' });
  const often = hooks.getByRole('group', { name: 'Hay dùng' });
  await expect(often.getByRole('option', { name: hook.name, exact: true })).toBeVisible();
  await expect(hooks.getByRole('option', { name: hook.name, exact: true })).toHaveCount(1); // shown once, in Hay dùng only
  await expect(hooks.getByRole('option').first()).toHaveAccessibleName(hook.name);

  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'custb');
  await other.goto('/marketing-studio');
  await hookBox(other).click();
  const theirs = other.getByRole('dialog', { name: 'Chọn hook' });
  await expect(theirs.getByRole('option').first()).toHaveAccessibleName(HOOKS[0]!.name);
  await expect(theirs.getByRole('group', { name: 'Hay dùng' })).toHaveCount(0);
  await other.close();
});

test("a Hay dùng card with no sample shows the poster of the member's latest clip with it; the other cards keep no picture", async ({ page }) => {
  await signIn(page, 'custa');
  const name = `Ảnh ${unique()}`;
  const own = await addChoice(page, { kind: 'hook', name, phrase: 'The creator spins once and smiles.' });
  const quiet = `Ít ${unique()}`;
  await addChoice(page, { kind: 'hook', name: quiet, phrase: 'The creator nods.' });
  const [person, product] = [await upload(page, 'thumb-person.png'), await upload(page, 'thumb-product.png')];
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) ids.push(await post(page, { feature: 'marketing', modelId: 'mock-e2e', assetIds: [person, product], ratio: '9:16', durationSec: 5, prompt: 'composed', params: { audio: 'off', hook: own } }));
  const jobs = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string; posterAssetId: string | null }[] }).jobs;
  await expect.poll(async () => (await jobs()).filter((j) => ids.includes(j.id) && j.status === 'succeeded').length, { timeout: 60_000 }).toBe(2);
  const poster = (await jobs()).find((j) => j.id === ids[1])!.posterAssetId; // the later Run is the latest clip
  expect(poster).not.toBeNull();

  await page.goto('/marketing-studio');
  await hookBox(page).click();
  const hooks = page.getByRole('dialog', { name: 'Chọn hook' });
  const card = hooks.getByRole('group', { name: 'Hay dùng' }).getByRole('option', { name, exact: true });
  await expect(card.locator('img')).toHaveAttribute('src', `/api/assets/${poster}/content`);
  await expect.poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(hooks.getByRole('option', { name: quiet, exact: true }).locator('img')).toHaveCount(0); // never used: no picture

  // With an Admin sample loop the card plays it, and the member's poster does not show as its first frame.
  const loop = `marketing-hook-${own}.mp4`;
  await page.route('**/api/samples', async (r) => r.fulfill({ json: { samples: [...((await (await r.fetch()).json()) as { samples: { name: string }[] }).samples, { name: loop, bytes: 1 }] } }));
  await page.route(`**/api/samples/${loop}`, (r) => r.fulfill({ body: readFileSync(fileURLToPath(new URL('../public/fixtures/examples/example-1.mp4', import.meta.url))), contentType: 'video/mp4' }));
  await page.reload();
  await hookBox(page).click();
  const sampled = hooks.getByRole('group', { name: 'Hay dùng' }).getByRole('option', { name, exact: true });
  await expect(sampled.locator('video')).toHaveAttribute('src', `/api/samples/${loop}`);
  await expect(sampled.locator(`[poster*="/api/assets/"], img`)).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test("the API refuses another member's private hook in a job", async ({ page, browser }) => {
  await signIn(page, 'custa');
  const mine = await addChoice(page, { kind: 'hook', name: `Riêng ${unique()}`, phrase: 'Private words.' });
  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'custb');
  const [person, product] = [await upload(other, 'b-person.png'), await upload(other, 'b-product.png')];
  const res = await other.request.post('/api/jobs', { data: { feature: 'marketing', modelId: 'mock-e2e', assetIds: [person, product], ratio: '9:16', durationSec: 5, prompt: 'composed', params: { audio: 'off', hook: mine } } });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/^params\.hook must be one of/);
  await other.close();
});

import { type Browser, expect, type Page, test } from '@playwright/test';
import { type UserKey } from './users';
import { optionsOf, png, select, selectText, signIn } from './support.test';

// The choices library by store on Marketing Studio: a member shares a hook with the page's store, and another member sees it under that store's group, not
// under another store; only a template editor (or an Admin) shares with the company. Nothing is run. Every hook made here is deleted in `finally`:
// marketing.e2e.test.ts counts HOOKS.length cards, and a page with no store shows every store's.
const hookBox = (page: Page) => page.getByRole('button', { name: /^Hook/ });
const unique = () => Date.now().toString(36);

async function as(browser: Browser, user: UserKey, store?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, user);
  await page.goto('/marketing-studio');
  if (store) await selectText(page, 'Cửa hàng/Thương hiệu', store);
  return page;
}

/** Opens the add form from the hook dialog and fills a hook with this name and niche. */
async function fillHook(page: Page, name: string, niche = '') {
  await hookBox(page).click();
  await page.getByRole('dialog', { name: 'Chọn hook' }).getByRole('button', { name: 'Thêm hook của bạn' }).click();
  const form = page.getByRole('dialog', { name: 'Thêm hook của bạn' }).getByRole('group', { name: 'Thêm hook' });
  await form.getByLabel('Tên', { exact: true }).fill(name);
  await form.getByLabel('Cảnh cho AI (tiếng Anh)').fill(`The creator waves ${name}.`);
  if (niche) await form.getByLabel('Ngách (tuỳ chọn)').fill(niche);
  return form;
}

test("a hook shared with the page's store shows for another member under that store's group, not under another store, and filters by its niche", async ({ browser }) => {
  const name = `Cửa hàng ${unique()}`;
  const niche = `Ngách ${unique()}`;
  const owner = await as(browser, 'chsa', 'E2E Shop');
  let other: Page | undefined;
  try {
    const form = await fillHook(owner, name, niche);
    await select(owner, 'Chia sẻ').click();
    await expect(optionsOf(owner, 'Chia sẻ')).toHaveText(['Chỉ mình tôi', 'Cửa hàng đang chọn (E2E Shop)']); // a member does not share with the company
    await optionsOf(owner, 'Chia sẻ').getByText('Cửa hàng đang chọn (E2E Shop)').click();
    // An optional photo: the uploaded-photos picker opens over the form and closes back to it; an upload fills the slot.
    await form.getByRole('button', { name: 'Ảnh đã tải cho Ảnh minh hoạ (tuỳ chọn)' }).click();
    await expect(owner.getByRole('dialog', { name: 'Ảnh đã tải' })).toBeVisible();
    await owner.keyboard.press('Escape');
    await expect(owner.getByRole('dialog', { name: 'Ảnh đã tải' })).toBeHidden();
    await expect(form).toBeVisible();
    await form.getByLabel('Ảnh minh hoạ', { exact: true }).setInputFiles({ name: 'spot.png', mimeType: 'image/png', buffer: png() });
    await expect(form.getByRole('img', { name: 'spot.png' })).toBeVisible();
    await form.getByRole('button', { name: 'Lưu & chọn' }).click();
    await expect(hookBox(owner)).toContainText(name);
    other = await as(browser, 'chsb', 'E2E Shop'); // the page reads the lists when it opens

    // The other member, on the same store: the store's group holds it, with the niche chip; the dialog's store filter starts on the page's store.
    await hookBox(other).click();
    const hooks = other.getByRole('dialog', { name: 'Chọn hook' });
    await expect(select(other, 'Cửa hàng')).toHaveText('E2E Shop');
    await expect(hooks.getByRole('group', { name: 'Của cửa hàng E2E Shop' }).getByRole('option', { name, exact: true })).toBeVisible();
    await expect(hooks.getByRole('option', { name, exact: true }).locator('img')).toHaveAttribute('src', /^\/api\/assets\/.+\/content$/); // its photo, readable by another member
    await expect(hooks.getByRole('group', { name: 'Có sẵn' }).getByRole('option').first()).toBeVisible();
    const niches = hooks.getByRole('group', { name: 'Ngách' });
    await niches.getByRole('button', { name: niche, exact: true }).click();
    await expect(niches.getByRole('button', { name: niche, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(hooks.getByRole('option')).toHaveCount(1); // the built-in ones have no niche
    await expect(hooks.getByRole('region', { name: 'Hook của bạn' })).toHaveCount(0); // not theirs, and they are not an editor
    // Another store in the filter: not there.
    await selectText(other, 'Cửa hàng', 'E2E Brand Shop');
    await expect(hooks.getByRole('option', { name, exact: true })).toHaveCount(0);
    await other.keyboard.press('Escape');
    // The page on another store opens the dialog on that store: still not there; every store shows it again.
    await selectText(other, 'Cửa hàng/Thương hiệu', 'E2E Brand Shop');
    await hookBox(other).click();
    await expect(select(other, 'Cửa hàng')).toHaveText('E2E Brand Shop');
    await expect(hooks.getByRole('option', { name, exact: true })).toHaveCount(0);
    await selectText(other, 'Cửa hàng', 'Tất cả cửa hàng');
    await expect(hooks.getByRole('group', { name: 'Của cửa hàng E2E Shop' }).getByRole('option', { name, exact: true })).toBeVisible();
  } finally {
    const { hooks } = (await (await owner.request.get('/api/choices?kind=hook')).json()) as { hooks: { id: string; name: string }[] };
    for (const h of hooks.filter((c) => c.name === name)) expect((await owner.request.delete(`/api/choices/${h.id}`)).status()).toBe(204);
    await owner.context().close();
    await other?.context().close();
  }
});

test('a template editor shares a hook with the company, which every member sees under Công ty; a member cannot', async ({ browser }) => {
  const name = `Công ty ${unique()}`;
  const editor = await as(browser, 'chsed');
  let member: Page | undefined;
  try {
    const form = await fillHook(editor, name);
    await select(editor, 'Chia sẻ').click();
    await expect(optionsOf(editor, 'Chia sẻ')).toHaveText(['Chỉ mình tôi', 'Cửa hàng đang chọn', 'Toàn công ty']);
    await optionsOf(editor, 'Chia sẻ').getByText('Toàn công ty').click();
    await form.getByRole('button', { name: 'Lưu & chọn' }).click();
    await expect(hookBox(editor)).toContainText(name);
    member = await as(browser, 'chsb');

    await hookBox(member).click();
    const hooks = member.getByRole('dialog', { name: 'Chọn hook' });
    await expect(hooks.getByRole('group', { name: 'Công ty' }).getByRole('option', { name, exact: true })).toBeVisible();
    await hooks.getByRole('button', { name: 'Thêm hook của bạn' }).click();
    await select(member, 'Chia sẻ').click();
    await expect(optionsOf(member, 'Chia sẻ')).toHaveText(['Chỉ mình tôi', 'Cửa hàng đang chọn']);
    const refused = await member.request.post('/api/choices', { data: { kind: 'hook', name: 'x', phrase: 'y', isCompany: true } });
    expect(refused.status()).toBe(403);
  } finally {
    const { hooks } = (await (await editor.request.get('/api/choices?kind=hook')).json()) as { hooks: { id: string; name: string }[] };
    for (const h of hooks.filter((c) => c.name === name)) expect((await editor.request.delete(`/api/choices/${h.id}`)).status()).toBe(204);
    await editor.context().close();
    await member?.context().close();
  }
});

test('Sửa in the library: a member edits their own hook from the prefilled form and sees the new name; a company hook has Sửa for an editor only', async ({ browser }) => {
  const mine = `Của tôi ${unique()}`;
  const renamed = `Đã sửa ${unique()}`;
  const company = `Công ty sửa ${unique()}`;
  const editor = await as(browser, 'chsed');
  const member = await as(browser, 'chsa');
  try {
    expect((await editor.request.post('/api/choices', { data: { kind: 'hook', name: company, phrase: 'The creator waves at the camera.', isCompany: true } })).status()).toBe(201);
    const up = (await (await member.request.post('/api/assets', { multipart: { file: { name: 'spot.png', mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] };
    const own = { kind: 'hook', name: mine, phrase: 'The creator spins once.', desc: 'Xoay một vòng', niche: 'Áo dài', imageAssetId: up.assets[0]!.id };
    expect((await member.request.post('/api/choices', { data: own })).status()).toBe(201);
    await member.reload(); // the page reads the lists when it opens

    await hookBox(member).click();
    const hooks = member.getByRole('dialog', { name: 'Chọn hook' });
    const ownList = hooks.getByRole('region', { name: 'Hook của bạn' });
    await expect(hooks.getByRole('group', { name: 'Công ty' }).getByRole('option', { name: company, exact: true })).toBeVisible();
    await expect(member.getByRole('button', { name: `Sửa hook ${company}` })).toHaveCount(0); // a member does not edit a company hook
    // A card with no photo or sample keeps its line under its name, not run into it.
    const plain = hooks.getByRole('group', { name: 'Có sẵn' }).getByRole('option').filter({ hasNot: member.locator('img, video') }).first();
    const nameBox = (await plain.locator('.choice-name').boundingBox())!;
    expect((await plain.locator('.choice-desc').boundingBox())!.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
    await ownList.getByRole('button', { name: `Sửa hook ${mine}` }).click();
    // The add form, filled with the hook: name, line, scene, niche, photo and share level.
    const form = member.getByRole('dialog', { name: `Sửa hook ${mine}` }).getByRole('group', { name: 'Sửa hook' });
    await expect(form.getByLabel('Tên', { exact: true })).toHaveValue(mine);
    await expect(form.getByLabel('Mô tả ngắn (tuỳ chọn)')).toHaveValue(own.desc);
    await expect(form.getByLabel('Cảnh cho AI (tiếng Anh)')).toHaveValue(own.phrase);
    await expect(form.getByLabel('Ngách (tuỳ chọn)')).toHaveValue(own.niche);
    await expect(form.getByRole('img', { name: mine })).toHaveAttribute('src', `/api/assets/${own.imageAssetId}/content`);
    await expect(select(member, 'Chia sẻ')).toHaveText('Chỉ mình tôi');
    await expect(form.getByRole('group', { name: 'Điền thử một ví dụ' })).toHaveCount(0);
    await form.getByLabel('Tên', { exact: true }).fill(renamed);
    await form.getByRole('button', { name: 'Lưu', exact: true }).click();
    // Back on the list, reloaded: the card and the own list carry the new name; the rest is kept.
    await expect(hooks.getByRole('option', { name: renamed, exact: true })).toBeVisible();
    await expect(hooks.getByRole('option', { name: mine, exact: true })).toHaveCount(0);
    await expect(ownList.getByRole('button', { name: `Sửa hook ${renamed}` })).toBeVisible();
    const { hooks: listed } = (await (await member.request.get('/api/choices?kind=hook')).json()) as { hooks: { name: string; phrase: string; desc: string; niche: string | null; imageAssetId: string | null }[] };
    expect(listed.find((c) => c.name === renamed)).toMatchObject({ phrase: own.phrase, desc: own.desc, niche: own.niche, imageAssetId: own.imageAssetId });

    // The editor: Sửa on the company hook, its form on the company share.
    await editor.reload();
    await hookBox(editor).click();
    await editor.getByRole('dialog', { name: 'Chọn hook' }).getByRole('button', { name: `Sửa hook ${company}` }).click();
    await expect(editor.getByRole('dialog', { name: `Sửa hook ${company}` }).getByLabel('Tên', { exact: true })).toHaveValue(company);
    await expect(select(editor, 'Chia sẻ')).toHaveText('Toàn công ty');
  } finally {
    for (const [page, names] of [[member, [mine, renamed]], [editor, [company]]] as const) {
      const { hooks } = (await (await page.request.get('/api/choices?kind=hook')).json()) as { hooks: { id: string; name: string }[] };
      for (const h of hooks.filter((c) => names.includes(c.name))) expect((await page.request.delete(`/api/choices/${h.id}`)).status()).toBe(204);
      await page.context().close();
    }
  }
});

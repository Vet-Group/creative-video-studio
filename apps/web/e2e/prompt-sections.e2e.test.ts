import { expect, type Page, test } from '@playwright/test';
import { ENDINGS, HOOKS } from '../src/lib/marketing';
import { PROMPT_TEMPLATES } from '../src/lib/prompt-starters';
import { modelButton, openPromptTemplates, openTemplates, png, signIn } from './support.test';

// The sectioned prompt (owner 2026-11-05) on Create and Marketing Studio: ① Hook, ② Body (the page's own prompt box) and ③ Ending,
// a templates menu that fills all three, the English preview of what Run sends, Reuse, and free writing. Suggestions come from the e2e worker's
// stand-in (CVS_FAKE_SUGGEST): "Option n: <the member's text or the field>".

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const mode = (page: Page) => page.getByRole('radiogroup', { name: 'Cách viết prompt' });
const part = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const hookBox = (page: Page) => page.getByRole('textbox', { name: 'Hook tự viết (tuỳ chọn)' });
const endingBox = (page: Page) => page.getByRole('textbox', { name: 'Cảnh kết (tuỳ chọn)' });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const preview = (page: Page) => page.locator('.prompt-preview p');
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function useTemplate(page: Page, name: string): Promise<void> {
  await (await openPromptTemplates(page)).getByRole('group', { name: 'Khung prompt' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

/** The member's newest job of `feature` once it is done, as GET /api/jobs/:id answers it. */
async function newest(page: Page, feature: string): Promise<Record<string, unknown>> {
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string; feature: string }[] }).jobs.filter((j) => j.feature === feature);
  await expect.poll(async () => (await mine())[0]?.status, { timeout: 60_000 }).toBe('succeeded');
  return (await (await page.request.get(`/api/jobs/${(await mine())[0]!.id}`)).json()) as Record<string, unknown>;
}

test('Create: the sections show by default, Khung prompt fills all three, the preview is what the job gets, and Dùng lại refills the sections', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'secta');
  await page.goto('/create');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(mode(page).getByRole('radio', { name: 'Theo phần' })).toBeChecked();
  for (const name of ['① Hook · 0–2 giây đầu', '② Diễn biến', '③ Kết · cảnh cuối']) await expect(part(page, name)).toBeVisible();
  // ② is the page's own prompt box, with its own rule line.
  await expect(part(page, '② Diễn biến').getByLabel('Mô tả chuyển động')).toBeVisible();
  await expect(part(page, '② Diễn biến')).toContainText('Một hành động chính, thì hiện tại, nói rõ ánh sáng và máy quay.');
  await expect(page.getByRole('group', { name: 'Gợi ý nhanh' })).toHaveCount(0); // the templates replace the starter chips

  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('shirt.png'));
  await expect(page.getByRole('img', { name: 'shirt.png' })).toBeVisible();
  const t = PROMPT_TEMPLATES.video[0]!;
  await useTemplate(page, t.name);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(t.body);
  await expect(endingBox(page)).toHaveValue(t.ending);

  // ③ asks for its own suggestions, with the other sections as the rest of the clip, and a pick fills it.
  let sent: Record<string, unknown> | undefined;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && (sent = r.postDataJSON()));
  await page.getByRole('button', { name: 'Gợi ý cảnh kết' }).click();
  await page.getByRole('group', { name: 'Gợi ý cảnh kết' }).getByRole('button', { name: /^Gợi ý 2/ }).click({ timeout: 20_000 });
  expect(sent).toMatchObject({ field: 'ending', text: t.ending, rest: `${t.hook} ${t.body}`, model: 'mock-e2e' });
  await expect(endingBox(page)).toHaveValue(`Option 2: ${t.ending}`);
  // The library fills ③ with a built-in ending's phrase and names it.
  await page.getByRole('button', { name: /^Cảnh kết có sẵn/ }).click();
  await page.getByRole('dialog', { name: 'Chọn cảnh kết' }).getByRole('option', { name: ENDINGS[2]!.name, exact: true }).click();
  await expect(endingBox(page)).toHaveValue(ENDINGS[2]!.phrase);
  await expect(page.getByRole('button', { name: /^Cảnh kết có sẵn/ })).toContainText(ENDINGS[2]!.name);

  const composed = `${t.hook} ${t.body} ${ENDINGS[2]!.phrase}`;
  await expect(page.locator('.prompt-preview')).toHaveAttribute('open', ''); // open by default on a computer
  await expect(preview(page)).toHaveText([composed]);
  await expect(page.locator('.prompt-preview-count')).toHaveText(`${composed.length}/2000 ký tự`);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const job = await newest(page, 'video');
  expect(job).toMatchObject({ prompt: composed, hookText: t.hook, ending: ENDINGS[2]!.phrase });

  await page.goto(`/create?reuse=${job.id}`);
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(t.body);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(endingBox(page)).toHaveValue(ENDINGS[2]!.phrase);

  // free writing takes the composed prompt in today's one box; back in the sections, they are as they were. The choice is remembered.
  await mode(page).getByText('Viết tự do').click();
  await expect(part(page, '① Hook · 0–2 giây đầu')).toHaveCount(0);
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(composed);
  await page.getByLabel('Mô tả chuyển động').fill('a slow turn');
  await mode(page).getByText('Theo phần').click();
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(t.body);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await mode(page).getByText('Viết tự do').click();
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(composed);
  await page.getByLabel('Mô tả chuyển động').fill('a slow turn');
  await page.reload();
  await expect(mode(page).getByRole('radio', { name: 'Viết tự do' })).toBeChecked();
  await expect(page.getByLabel('Mô tả chuyển động')).toBeVisible();
  await expect(hookBox(page)).toHaveCount(0);
});

test('Marketing Studio: the own hook counts only with no hook chosen, the job keeps the sections, Dùng lại refills them, and Viết tự do still runs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'sectb');
  await page.goto('/marketing-studio');
  await expect(page.getByLabel('Ảnh người mẫu')).toBeEnabled();
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(page.getByRole('img', { name: 'model.png' })).toBeVisible();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(modelButton(page)).toContainText('Mock E2E');
  // ③ holds the end text box beside the last shot.
  await expect(part(page, '③ Kết · cảnh cuối').getByLabel('Chữ trên khung cuối (tuỳ chọn)')).toBeVisible();
  // The end text is optional the one way the sections use: the optional pill beside its name.
  await expect(part(page, '③ Kết · cảnh cuối').locator('.optional-head', { hasText: 'Chữ trên khung cuối' }).locator('.choice-optional')).toHaveText('Tuỳ chọn');
  // Its rule line sits right under the Cảnh kết box, above the end text.
  const ruleY = (await part(page, '③ Kết · cảnh cuối').locator('.prompt-part-rule').boundingBox())!.y;
  expect(ruleY).toBeGreaterThan((await endingBox(page).boundingBox())!.y);
  expect(ruleY).toBeLessThan((await page.getByLabel('Chữ trên khung cuối (tuỳ chọn)').boundingBox())!.y);

  const t = PROMPT_TEMPLATES.marketing[0]!;
  await useTemplate(page, t.name);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue(t.body);
  await expect(endingBox(page)).toHaveValue(t.ending);
  await expect(preview(page)).toContainText(`${t.hook} Creator notes: ${t.body} ${t.ending}`);

  // The library hook sits in ① beside the own words, out of the photo grid; a chosen hook wins over the own words, and the section says so.
  await expect(page.locator('.marketing-slots').getByRole('button', { name: /^Hook/ })).toHaveCount(0);
  // Bối cảnh sits in ② Diễn biến, above the body box, as the hook box sits in ①.
  await expect(page.locator('.marketing-slots').getByRole('button', { name: /^Bối cảnh/ })).toHaveCount(0);
  const location = part(page, '② Diễn biến').getByRole('button', { name: /^Bối cảnh/ });
  await expect(location).toBeVisible();
  expect((await location.boundingBox())!.y).toBeLessThan((await page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' }).boundingBox())!.y);
  await part(page, '① Hook · 0–2 giây đầu').getByRole('button', { name: /^Hook/ }).click();
  await page.getByRole('dialog', { name: 'Chọn hook' }).getByRole('option', { name: HOOKS[0]!.name, exact: true }).click();
  await expect(part(page, '① Hook · 0–2 giây đầu')).toContainText('Đang dùng hook đã chọn; chữ tự viết chỉ dùng khi bỏ chọn hook đó.');
  await expect(preview(page)).toContainText(HOOKS[0]!.phrase);
  await expect(preview(page)).not.toContainText(t.hook);
  await page.getByRole('button', { name: 'Bỏ Hook' }).click();
  await expect(preview(page)).toContainText(t.hook);

  const shown = await preview(page).innerText();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const job = await newest(page, 'marketing');
  expect(job).toMatchObject({ prompt: shown, hookText: t.hook, brief: t.body, ending: t.ending, hook: null });
  // The Library detail shows the member's own hook beside the brief and the ending.
  await page.goto('/library');
  await page.getByRole('article', { name: new RegExp(`${String(job.id).slice(0, 8)}\\.[a-z0-9]+$`) }).getByRole('button', { name: 'Xem chi tiết' }).click();
  const recipe = page.getByRole('dialog').locator('.recipe-text');
  await expect(recipe.filter({ has: page.getByRole('heading', { name: 'Hook tự viết' }) })).toContainText(t.hook);
  await expect(recipe.filter({ has: page.getByRole('heading', { name: 'Cảnh kết' }) })).toContainText(t.ending);
  await page.keyboard.press('Escape');

  await page.goto(`/marketing-studio?reuse=${job.id}`);
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue(t.body);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(endingBox(page)).toHaveValue(t.ending);

  // free writing: the sections' words in today's one box, the end text still there, and Run sends the box's words as the brief.
  await mode(page).getByText('Viết tự do').click();
  await expect(hookBox(page)).toHaveCount(0);
  await expect(page.locator('.marketing-slots').getByRole('button', { name: /^Hook/ })).toBeVisible(); // the library hook goes back to the grid
  await expect(page.locator('.marketing-slots').getByRole('button', { name: /^Bối cảnh/ })).toBeVisible(); // and so does the location
  await expect(part(page, '② Diễn biến')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue(`${t.hook} ${t.body} ${t.ending}`);
  await expect(page.getByLabel('Chữ trên khung cuối (tuỳ chọn)')).toBeVisible();
  await page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' }).fill('mở hộp và cười');
  const sentJob = new Promise<{ prompt: string; params: Record<string, unknown> }>((resolve) => {
    void page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      resolve(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: 'caught', status: 'queued' } });
    });
  });
  await runButton(page).click();
  const body = await sentJob;
  expect(body.params).toMatchObject({ brief: 'mở hộp và cười' });
  expect(body.params).not.toHaveProperty('hookText');
  expect(body.params).not.toHaveProperty('ending');
  expect(body.prompt).toContain('Creator notes: mở hộp và cười');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('at 390 px the templates open as a sheet over the Run bar with the last one in reach, the sections and the folded preview fit, on Create and Marketing Studio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'secta');
  for (const [path, list, body] of [
    ['/create', PROMPT_TEMPLATES.video, 'Mô tả chuyển động'],
    ['/marketing-studio', PROMPT_TEMPLATES.marketing, 'Mô tả (tuỳ chọn)'],
  ] as const) {
    const t = list.at(-1)!;
    await page.goto(path);
    await expect(part(page, '② Diễn biến')).toBeVisible();
    const sheet = await openPromptTemplates(page);
    await expect(sheet).toHaveClass(/template-sheet/);
    await expect(sheet.getByText('Điền sẵn Hook · Diễn biến · Kết để bạn sửa tiếp.')).toBeVisible();
    const last = sheet.getByRole('button', { name: new RegExp(`^${t.name}`) });
    // Each template: its Vietnamese line; on Create also what it opens and ends on, one muted line each. Marketing Studio's taller sheet keeps the one line.
    for (const x of list) await expect(sheet.getByRole('button', { name: new RegExp(`^${x.name}`) })).toContainText(x.desc);
    if (path === '/create') {
      await expect(last).toContainText(`Hook: ${t.hook}`);
      await expect(last).toContainText(`Kết: ${t.ending}`);
      for (const line of await sheet.locator('.prompt-template-line').all()) expect((await line.boundingBox())!.height).toBe(18);
    } else await expect(sheet.locator('.prompt-template-line')).toHaveCount(0);
    // Whole on the screen and on top, with no scrolling first: nothing (the sticky Run bar) covers its middle.
    await expect(last).toBeInViewport({ ratio: 1 });
    expect(await last.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    expect(await fits(page)).toBe(true);
    await last.click();
    await expect(sheet).toHaveCount(0);
    await expect(hookBox(page)).toHaveValue(t.hook);
    await expect(page.getByRole('textbox', { name: body })).toHaveValue(t.body);
    await expect(endingBox(page)).toHaveValue(t.ending);
    // On a phone the preview starts folded, its length still in sight.
    await expect(page.locator('.prompt-preview')).not.toHaveAttribute('open');
    await expect(page.locator('.prompt-preview summary .prompt-preview-count')).toBeVisible();
    await page.getByText('Xem prompt gửi đi').click();
    await expect(preview(page).first()).toBeVisible();
    expect(await fits(page)).toBe(true);
    for (const section of ['① Hook · 0–2 giây đầu', '③ Kết · cảnh cuối']) {
      const box = (await part(page, section).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
  }
});

test('the preview is open on a computer and folded on a phone from the first paint: the server renders it open, and CSS folds it on a phone until hydration', async ({ page, browser }) => {
  await signIn(page, 'secta');
  const noScript = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() });
  try {
    const p = await noScript.newPage();
    for (const [width, open] of [[1440, true], [390, false]] as const) {
      await p.setViewportSize({ width, height: 900 });
      await p.goto('/create');
      await expect(p.locator('.prompt-preview')).toHaveAttribute('open', '');
      await expect(p.locator('.prompt-preview summary')).toBeVisible();
      await expect(p.locator('.prompt-preview > :not(summary)').first()).toBeVisible({ visible: open });
    }
  } finally {
    await noScript.close();
  }
});

test('Create: Khung prompt opens as a card dialog on a computer, and its Gần đây group lists the last hooks and endings and fills one section each', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'sectc');
  await page.goto('/create');
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  const second = part(page, '② Diễn biến');
  const before = (await second.boundingBox())!;
  const dialog = await openPromptTemplates(page);
  // A dialog like the hook picker (not the phone's sheet), and the form under it stays where it was: nothing opens inline.
  await expect(dialog).toHaveClass(/choice-dialog/);
  await expect(dialog).not.toHaveClass(/template-sheet/);
  await expect(dialog.getByText('Điền sẵn Hook · Diễn biến · Kết để bạn sửa tiếp.')).toBeVisible();
  expect(await second.boundingBox()).toEqual(before);
  for (const t of PROMPT_TEMPLATES.video) await expect(dialog.getByRole('button', { name: new RegExp(`^${t.name}`) })).toContainText(t.desc);
  expect(await fits(page)).toBe(true);
  await expect(dialog.getByRole('region', { name: 'Gần đây' })).toHaveCount(0); // no jobs yet
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Khung prompt' })).toBeFocused();

  // Five jobs: hook "one" twice, so the list has four distinct hooks, of which the newest three show; two endings.
  const up = await page.request.post('/api/assets', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png() } } });
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  for (const [hookText, ending] of [['hook one', 'end one'], ['hook two', undefined], ['hook three', 'end two'], ['hook one', undefined], ['hook four', undefined]] as const) {
    const sent = await page.request.post('/api/jobs', { data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e', prompt: `${hookText} body`, ratio: '9:16', durationSec: 5, params: { hookText, ...(ending && { ending }) } } });
    expect(sent.status()).toBe(201);
  }
  await page.goto('/create');
  const again = await openPromptTemplates(page);
  const recent = again.getByRole('region', { name: 'Gần đây' });
  await expect(recent.getByRole('group', { name: 'Hook gần đây' }).getByRole('button')).toHaveText(['hook four', 'hook one', 'hook three']);
  await expect(recent.getByRole('group', { name: 'Kết gần đây' }).getByRole('button')).toHaveText(['end two', 'end one']);
  // A recent hook fills ① only, with no question while the box is empty.
  await recent.getByRole('button', { name: 'hook four' }).click();
  await expect(again).toBeHidden();
  await expect(hookBox(page)).toHaveValue('hook four');
  await expect(endingBox(page)).toHaveValue('');
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue('');
  // With words in the box it asks first: a refusal keeps them, a yes replaces them.
  await (await openPromptTemplates(page)).getByRole('button', { name: 'hook three' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Huỷ' }).click();
  await expect(hookBox(page)).toHaveValue('hook four');
  await (await openPromptTemplates(page)).getByRole('button', { name: 'hook three' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Thay', exact: true }).click();
  await expect(hookBox(page)).toHaveValue('hook three');
  // A recent ending fills ③ only.
  await (await openPromptTemplates(page)).getByRole('button', { name: 'end one' }).click();
  await expect(endingBox(page)).toHaveValue('end one');
  await expect(hookBox(page)).toHaveValue('hook three');
  // In free writing there are no sections to fill, so the group is not offered; and a failed fetch leaves the templates alone.
  await mode(page).getByText('Viết tự do').click();
  await expect((await openPromptTemplates(page)).getByRole('region', { name: 'Gần đây' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await mode(page).getByText('Theo phần').click();
  await page.route('**/api/recent-prompts*', (route) => route.abort());
  const failed = await openPromptTemplates(page);
  await expect(failed.getByRole('button', { name: new RegExp(`^${PROMPT_TEMPLATES.video[0]!.name}`) })).toBeVisible();
  await expect(failed.getByRole('region', { name: 'Gần đây' })).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('Create and Marketing Studio: Cài đặt video groups ratio, length, sound and model under one title, and each template kind says what it is', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'secta');
  for (const [path, ratio] of [['/create', 'Tỉ lệ khung hình'], ['/marketing-studio', 'Tỉ lệ']] as const) {
    await page.goto(path);
    await expect(modelButton(page)).toContainText('Mock E2E');
    const block = page.getByRole('group', { name: 'Cài đặt video', exact: true });
    await expect(block.getByText('Cài đặt video', { exact: true })).toBeVisible();
    for (const control of [block.getByRole('combobox', { name: ratio, exact: true }), block.getByRole('combobox', { name: 'Thời lượng', exact: true }), block.getByRole('switch', { name: 'Tạo âm thanh' }), block.getByRole('button', { name: /^Mô hình / })]) await expect(control).toBeVisible();
    // Each page's own order, and the block is not wider than the form.
    const y = async (c: ReturnType<typeof block.locator>) => (await c.boundingBox())!.y;
    const order = [block.getByRole('combobox', { name: 'Thời lượng', exact: true }), block.getByRole('switch', { name: 'Tạo âm thanh' })];
    if (path === '/marketing-studio') order.push(block.getByRole('button', { name: /^Mô hình / }));
    for (let i = 1; i < order.length; i++) expect(await y(order[i]!)).toBeGreaterThan(await y(order[i - 1]!));
    expect(await fits(page)).toBe(true);
    // Templates: the line of "Thiết lập đã lưu" says it saves the whole form.
    const mine = await openTemplates(page);
    await expect(mine.getByText('Lưu cả form (ảnh, cài đặt) để dùng lại.')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.goto('/create');
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  await expect(page.getByRole('dialog', { name: 'Bộ sưu tập mẫu' }).getByText('chọn mẫu sẽ thay cả prompt', { exact: false })).toBeVisible();
});

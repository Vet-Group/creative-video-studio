import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { inSeason, STARTERS } from '../src/lib/prompt-starters';
import { modelButton, openMore, openTab, pickModel, png, select, selectText, signIn } from './support.test';

// Image Generation's prompt bar, as Fash's: on a wide screen it floats at the foot of the screen over the full-width tabs and gallery, and holds every
// control of the old left form; below 1024 px it is the Create tab's card, in the page's flow.

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const LONG = 'A full-length studio photo of a model in a cream linen shirt and wide navy trousers, standing beside a wooden chair by a tall window, soft morning light from the left, a pale grey seamless backdrop, natural skin texture, relaxed pose with one hand in a pocket, shot on a 50 mm lens at eye level, calm editorial mood, no text, no logo.';
const near = (actual: number, expected: number, what: string) => expect(Math.abs(actual - expected), `${what}: ${actual}, expected ${expected}`).toBeLessThanOrEqual(1);
const blocking = async (page: Page) =>
  (await new AxeBuilder({ page }).include('.imagebar').analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
const barOf = (page: Page) => page.getByRole('region', { name: 'Thanh tạo ảnh' });
/** The focused control's accessible name, as a screen reader reads it. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> };
    const by = el.getAttribute('aria-labelledby');
    const name = by ? by.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : (el.getAttribute('aria-label') ?? (el.labels?.[0]?.textContent || el.textContent));
    return (name ?? '').replace(/\s+/g, ' ').trim();
  });
/** Nothing covers the element: the middle of each of its parts takes a click there, so no wrapper clips it and no layer paints over it. */
const uncovered = (el: Locator) =>
  el.evaluate((root) =>
    [root, ...root.querySelectorAll('[role=option], button')].every((part) => {
      const r = part.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= innerHeight && !!hit && root.contains(hit);
    }),
  );
/** A dialog's field names drawn smaller than 2 px (a screen-reader-only rule leaking from the bar into a dialog opened from it); toBeVisible passes on those. */
const hiddenLabels = (dialog: Locator) =>
  dialog.evaluate((d) => {
    const labels = [...d.querySelectorAll('.field-label')].filter((l) => !l.closest('.sr-only'));
    return { count: labels.length, hidden: labels.filter((l) => { const r = l.getBoundingClientRect(); return r.width <= 1 || r.height <= 1; }).map((l) => l.textContent) };
  });
async function fill(bar: Locator, n = 3) {
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(Array.from({ length: n }, (_, i) => file(`ref-${i + 1}.png`)));
  await expect(bar.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' }).getByRole('img')).toHaveCount(n);
  await bar.getByRole('textbox', { name: 'Mô tả', exact: true }).fill(LONG);
}

test('at 1440 the prompt bar floats under the full-width tabs and holds every control; the prompt runs Run, focus goes prompt, chips, Run, and no menu is clipped', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbara');
  await page.goto('/image-generation');
  const bar = barOf(page);
  await expect(modelButton(page)).toContainText('Mock image E2E');
  // No left column: the hint, the tabs and the gallery span the page's column, and the bar is docked at the foot of the screen.
  await expect(page.locator('.form-card')).toHaveCount(0);
  const column = (await page.locator('.imagegen').boundingBox())!;
  near((await page.getByRole('complementary', { name: 'Khi nào dùng Tạo ảnh' }).boundingBox())!.width, column.width, 'hint width');
  near((await page.locator('.imagegen > .side').boundingBox())!.width, column.width, 'pane width');
  const b = (await bar.boundingBox())!;
  near(b.y + b.height, 900 - 24, 'bar bottom');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

  // Every control of the old form is in the bar and on screen; the store, brand kit, sent prompt and saved settings are one click away, under the more-options pill.
  const prompt = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  const run = bar.getByRole('button', { name: /^Tạo ảnh/ });
  const more = bar.getByRole('button', { name: /^Tuỳ chọn khác/ });
  for (const control of [
    bar.getByRole('button', { name: 'Tải lên Ảnh tham chiếu' }),
    bar.getByRole('button', { name: 'Ảnh đã tải cho Ảnh tham chiếu' }),
    prompt,
    bar.getByRole('group', { name: 'Gợi ý nhanh' }),
    bar.getByRole('button', { name: /^Cải thiện: / }),
    bar.getByRole('button', { name: 'Gợi ý AI' }),
    bar.getByRole('button', { name: 'Mở rộng' }),
    bar.getByRole('button', { name: 'Phong cách', exact: true }),
    bar.getByRole('button', { name: /^Mô hình / }),
    bar.getByRole('combobox', { name: 'Tỉ lệ', exact: true }),
    bar.getByRole('combobox', { name: 'Độ phân giải', exact: true }),
    more,
    run,
  ]) {
    await expect(control).toBeVisible();
    await expect(control).toBeInViewport();
  }
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(bar.getByRole('button', { name: 'Lưu thiết lập' })).toBeHidden();
  await openMore(page);
  for (const control of [bar.getByRole('combobox', { name: 'Cửa hàng/Thương hiệu', exact: true }), bar.getByRole('button', { name: 'Dùng bộ nhận diện', exact: true }), bar.getByRole('button', { name: 'Thiết lập đã lưu' }), bar.getByRole('button', { name: 'Lưu thiết lập' })]) {
    await expect(control).toBeInViewport();
  }
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  // Before a prompt the reason is a quiet muted line in the bar and Run's description; a prompt of spaces alone gets the box.
  await expect(run).toBeDisabled();
  const reason = bar.locator('#imagegen-reason');
  await expect(reason).toHaveText('Nhập mô tả cảnh bạn muốn tạo.');
  await expect(reason).toHaveAttribute('data-quiet');
  expect((await reason.boundingBox())!.height).toBeGreaterThan(10);
  await expect(run).toHaveAttribute('aria-describedby', 'imagegen-reason');
  await prompt.fill('   ');
  await expect(reason).not.toHaveAttribute('data-quiet');
  expect((await reason.boundingBox())!.width).toBeGreaterThan(100);

  // A reference photo shows as a thumbnail in the bar with its remove button, and the strip counts them against the model's limit: Slot's count,
  // shown from 0 on, at the strip's right past the uploaded-photos link, and read as the strip's description.
  const count = bar.locator('.slot-count > [aria-hidden="true"]');
  await expect(count).toHaveText('0/4');
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('bar-ref.png'));
  const thumb = bar.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' }).getByRole('img', { name: 'bar-ref.png' });
  await expect(thumb).toBeVisible();
  await expect(thumb).toBeInViewport();
  await expect(count).toHaveText('1/4');
  await expect(bar.getByRole('group', { name: /^Ảnh tham chiếu/ })).toHaveAccessibleDescription('1 trên 4 ảnh tham chiếu');
  const [c, link] = [(await count.boundingBox())!, (await bar.getByRole('button', { name: 'Ảnh đã tải cho Ảnh tham chiếu' }).boundingBox())!];
  expect(c.width).toBeGreaterThan(10);
  expect(c.x, 'the count right of the uploaded-photos link').toBeGreaterThan(link.x + link.width);
  await prompt.fill('a linen shirt on a wooden chair');
  await expect(run).toBeEnabled();
  await expect(run).not.toHaveAttribute('aria-describedby');

  // Keyboard: from the prompt, its tools, then the chips in their row, then Run.
  await prompt.focus();
  const order: string[] = [];
  for (let i = 0; i < 20 && !/^Tạo ảnh/.test(order.at(-1) ?? ''); i++) {
    await page.keyboard.press('Tab');
    order.push(await focusedName(page));
  }
  const chips = order.slice(order.indexOf('Phong cách'));
  expect(chips.map((n) => n.replace(/ .*/, ''))).toEqual(['Phong', 'Mô', 'Tỉ', 'Độ', 'Tuỳ', 'Tạo']);
  expect(chips[1]).toMatch(/^Mô hình Mock image E2E/);
  expect(order.slice(0, order.indexOf('Phong cách'))).toEqual(expect.arrayContaining(['Cải thiện: bật', 'Gợi ý AI', 'Mở rộng']));
  await expect(run).toBeFocused();

  // The menus open over the gallery, upward from the foot of the screen, whole: the bar clips none of them.
  await select(page, 'Tỉ lệ').focus();
  await page.keyboard.press('Enter');
  const ratios = page.getByRole('listbox', { name: 'Tỉ lệ' });
  await expect(ratios).toBeVisible();
  expect((await ratios.boundingBox())!.y + (await ratios.boundingBox())!.height).toBeLessThanOrEqual((await select(page, 'Tỉ lệ').boundingBox())!.y);
  expect(await uncovered(page.locator('.select-pop'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(ratios).toHaveCount(0);
  await modelButton(page).click();
  const models = page.getByRole('dialog', { name: 'Chọn mô hình' });
  await expect(models).toBeVisible();
  expect(await uncovered(models)).toBe(true);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Gợi ý AI' }).click();
  const ideas = page.getByRole('group', { name: 'Gợi ý AI' });
  await expect(ideas.getByRole('button', { name: /^Gợi ý \d/ })).toHaveCount(3, { timeout: 20_000 });
  expect((await ideas.boundingBox())!.y + (await ideas.boundingBox())!.height).toBeLessThanOrEqual((await prompt.boundingBox())!.y); // over the gallery, not growing the bar
  expect((await ideas.boundingBox())!.y).toBeGreaterThanOrEqual(0); // and never above the screen's top
  expect(await uncovered(ideas)).toBe(true);
  await page.keyboard.press('Escape');

  // Ctrl+Enter in the prompt runs, as on the old form, and History opens with the job.
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/jobs') && r.request().method() === 'POST');
  await prompt.press('Control+Enter');
  expect((await sent).status()).toBe(201);
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(bar.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect(bar).toBeInViewport(); // still docked over History
  // A toast shows at the top of the screen, clear of Run at the foot.
  await page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByTitle('Chép vào ô mô tả').first().click();
  const toast = page.getByRole('region', { name: 'Thông báo' }).getByText('Đã chép mô tả');
  await expect(toast).toBeVisible();
  expect((await toast.boundingBox())!.y).toBeLessThan(100);
});

test('the bar comes first for the keyboard: a few Tabs from the page tabs reach the prompt, not the whole gallery; Run says the page is loading, and Tabbing in meanwhile keeps the remembered settings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbare');
  // Run says the page is still loading while the model list, then the memory, are on their way.
  let models!: () => void, memory!: () => void;
  const [modelsHeld, memoryHeld] = [new Promise<void>((r) => (models = r)), new Promise<void>((r) => (memory = r))];
  await page.route(/\/api\/image-models/, async (route) => (await modelsHeld, route.continue()));
  await page.route(/\/api\/recall\?feature=image/, async (route) => (await memoryHeld, route.fulfill({ json: { settings: { modelId: 'mock-image-e2e', ratio: '3:4', durationSec: null, resolution: null, audio: null, enhance: null, storeId: null, brand: null } } })));
  await page.goto('/image-generation');
  const bar = barOf(page);
  const run = bar.getByRole('button', { name: /^Tạo ảnh/ });
  const prompt = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  await expect(run).toContainText('Đang tải…');
  models();
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(run).toContainText('Đang tải…');
  // Moving through the bar is not a change: the memory, answering after it, still sets the ratio.
  await page.getByRole('tab', { name: 'Ví dụ' }).focus();
  for (let i = 0; i < 6 && !(await prompt.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(prompt).toBeFocused();
  memory();
  await expect(run).not.toContainText('Đang tải…');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '3:4');
  await page.unroute(/\/api\/image-models/);
  await page.unroute(/\/api\/recall\?feature=image/);

  await openTab(page, 'Ví dụ');
  await expect(page.getByRole('group', { name: 'Ảnh của công ty' }).or(page.getByText('Chưa có ảnh nào trong công ty. Hãy tạo ảnh đầu tiên.'))).toBeVisible();
  await page.getByRole('tab', { name: 'Ví dụ' }).focus();
  let tabs = 0;
  while (tabs < 10 && !(await bar.getByRole('textbox', { name: 'Mô tả', exact: true }).evaluate((e) => e === document.activeElement))) {
    await page.keyboard.press('Tab');
    tabs++;
  }
  expect(tabs).toBeLessThanOrEqual(4); // the uploaded-photos link, the add tile, then the prompt
  // Docked under the pane all the same.
  expect((await bar.boundingBox())!.y).toBeGreaterThan((await page.locator('.imagegen > .side').boundingBox())!.y);
});

test('the dialogs opened from the bar keep their field names: Lưu thiết lập, the brand kit, a new style and the uploaded photos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbared');
  await page.goto('/image-generation');
  const bar = barOf(page);
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await openMore(page);

  await bar.getByRole('button', { name: 'Lưu thiết lập', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Lưu thiết lập' });
  await expect(save.getByLabel('Tên thiết lập')).toBeVisible();
  expect(await hiddenLabels(save)).toEqual({ count: expect.any(Number), hidden: [] });
  expect((await hiddenLabels(save)).count).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Thiết lập đã lưu', exact: true }).click();
  const list = page.getByRole('dialog', { name: 'Thiết lập đã lưu' });
  await expect(list).toBeVisible();
  // The bar's links are a size smaller; the dialog keeps the page's.
  expect(await list.evaluate((d) => getComputedStyle(d).fontSize)).toBe(await bar.locator('.templates').evaluate((t) => getComputedStyle(t).fontSize));
  await page.keyboard.press('Escape');

  await selectText(page, 'Cửa hàng/Thương hiệu', 'E2E Brand Shop');
  await bar.getByRole('button', { name: 'Bộ nhận diện', exact: true }).click();
  const kit = page.getByRole('dialog', { name: 'Bộ nhận diện' });
  await expect(kit.getByLabel('Phong cách thương hiệu')).toBeVisible();
  expect(await hiddenLabels(kit)).toEqual({ count: 3, hidden: [] });
  await page.keyboard.press('Escape');

  await bar.getByRole('button', { name: 'Phong cách', exact: true }).click();
  await page.getByRole('dialog', { name: 'Chọn phong cách' }).getByRole('button', { name: 'Thêm phong cách' }).click();
  const style = page.getByRole('dialog', { name: 'Thêm phong cách' });
  await expect(style).toBeVisible();
  const styleLabels = await hiddenLabels(style);
  expect(styleLabels.hidden).toEqual([]);
  expect(styleLabels.count).toBeGreaterThan(3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await bar.getByRole('button', { name: 'Ảnh đã tải cho Ảnh tham chiếu' }).click();
  const photos = page.getByRole('dialog', { name: 'Ảnh đã tải' });
  await expect(photos).toBeVisible();
  expect(await hiddenLabels(photos)).toEqual({ count: 2, hidden: [] }); // Lọc theo mục and Lọc theo cửa hàng
});

test('the bar stays compact with a long prompt and 3 photos: Run on the chip row, at most 45% of a 768 px screen and 30% of a 900 px one, and a bar taller than the screen leaves the foot', async ({ page }) => {
  await signIn(page, 'pbarb');
  for (const [width, height, share] of [[1024, 768, 0.45], [1366, 768, 0.45], [1440, 900, 0.3]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/image-generation');
    const bar = barOf(page);
    await expect(modelButton(page)).toContainText('Mock image');
    await fill(bar);
    await page.locator('.imagegen > .side').click({ position: { x: 4, y: 4 } }); // focus leaves the prompt, which shows three lines at rest
    const b = (await bar.boundingBox())!;
    expect(b.height, `${width}x${height}`).toBeLessThanOrEqual(height * share);
    const run = (await bar.getByRole('button', { name: /^Tạo ảnh/ }).boundingBox())!;
    const style = (await bar.getByRole('button', { name: 'Phong cách', exact: true }).boundingBox())!;
    near(run.y + run.height / 2, style.y + style.height / 2, `Run on the chip row at ${width}`);
    expect(run.x + run.width, `Run inside the bar at ${width}`).toBeLessThanOrEqual(b.x + b.width - 16);
    // The model's name may be cut, never hidden.
    expect((await modelButton(page).locator('.select-value-text').boundingBox())!.width, `model name at ${width}`).toBeGreaterThan(40);
  }
  // A chosen style with a long name gives way too, so Run still ends inside the bar on the narrowest wide screen.
  await page.route(/\/api\/presets\?feature=image$/, async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { presets: unknown[] };
    json.presets.push({ id: 'e2e-long-style', label: 'Ánh sáng studio mềm trên nền xám nhạt với bóng đổ dài', group: 'product', enabled: true });
    await route.fulfill({ response: res, json });
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/image-generation');
  const bar = barOf(page);
  await expect(modelButton(page)).toContainText('Mock image');
  await bar.getByRole('button', { name: 'Phong cách', exact: true }).click();
  await page.getByRole('dialog', { name: 'Chọn phong cách' }).getByRole('button', { name: 'Ánh sáng studio mềm trên nền xám nhạt với bóng đổ dài', exact: true }).click();
  const pill = bar.locator('.style-pill');
  await expect(pill).toContainText('Ánh sáng studio');
  const [b, run] = [(await bar.boundingBox())!, (await bar.getByRole('button', { name: /^Tạo ảnh/ }).boundingBox())!];
  expect(run.x + run.width, 'Run inside the bar with a long style').toBeLessThanOrEqual(b.x + b.width - 16);
  expect(await pill.locator('span').first().evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true); // cut with an ellipsis
  await page.unroute(/\/api\/presets\?feature=image$/);

  // A screen shorter than the bar: the bar leaves the foot for the page's flow, so its top can be scrolled to.
  await page.setViewportSize({ width: 1440, height: 900 });
  await fill(bar);
  await page.locator('.imagegen > .side').click({ position: { x: 4, y: 4 } });
  const h = (await bar.boundingBox())!.height;
  await page.setViewportSize({ width: 1440, height: Math.round(h + 40) });
  await expect(bar).toHaveAttribute('data-tall');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('static');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(bar).not.toHaveAttribute('data-tall');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
});

test('a Run of 4 pictures is priced four times on Run and sends four image jobs under one batch id', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbarn');
  await page.goto('/image-generation');
  const bar = barOf(page);
  await expect(modelButton(page)).toContainText('Mock image E2E');
  const cost = bar.getByRole('button', { name: /^Tạo ảnh/ }).locator('.run-cost');
  await expect(cost).toHaveText(/^· \$\d+\.\d{4}$/);
  const one = Number((await cost.textContent())!.replace('· $', ''));
  await expect(select(page, 'Số ảnh')).toBeHidden(); // under the more-options pill, as the chip row has no room for it
  await openMore(page);
  await expect(select(page, 'Số ảnh')).toHaveAttribute('data-value', '1');
  await expect(bar.getByText(/^\d ảnh × /)).toHaveCount(0); // one picture is priced as before
  await selectText(page, 'Số ảnh', '4 ảnh');
  await expect(bar.locator('.imagebar-more-on')).toContainText('1'); // the pill counts it as an option in use
  await expect(cost).toHaveText(`· $${(one * 4).toFixed(4)}`);
  await expect(bar.getByText(/^4 ảnh × \$[\d.]+ = \$[\d.]+$/)).toBeVisible();

  await bar.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen dress on a hanger');
  await bar.getByRole('button', { name: /^Tạo ảnh/ }).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; batch: string | null }[] };
  expect(jobs.jobs.map((j) => j.feature)).toEqual(['image', 'image', 'image', 'image']);
  expect(new Set(jobs.jobs.map((j) => j.batch)).size).toBe(1);
  expect(jobs.jobs[0]!.batch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

// On prod the suggested Nano Banana 2.1 shows its "Đề xuất" badge and a thinking pill, which once squeezed its name to one letter in the chip row.
test('a suggested model with thinking levels keeps its name readable in the chip row; its badge stays in the model menu', async ({ page }) => {
  await page.route('**/api/image-models?feature=image', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { models: { id: string; label: string; isMock: boolean; recommended: boolean; total: number }[] };
    // Recommended with 3 marks, so its badge shows (fewer marks hide it).
    body.models = body.models.map((m) => (m.id === 'mock-image-solo' ? { ...m, label: 'Nano Banana 2.1', isMock: false, recommended: true, total: Math.max(3, m.total) } : { ...m, recommended: false }));
    await route.fulfill({ response: res, json: body });
  });
  await signIn(page, 'pbark');
  for (const [width, height] of [[1440, 900], [1024, 768]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/image-generation');
    const bar = barOf(page);
    await pickModel(page, /Nano Banana 2.1/); // pickModel types the pattern's source into the search box, so no escape
    await expect(select(page, 'Mức suy luận')).toHaveAttribute('data-value', 'minimal');
    const trigger = modelButton(page);
    await expect(trigger.locator('.badge-recommended')).toBeHidden();
    const name = trigger.locator('.select-value-text');
    const [w, full] = await name.evaluate((e) => [e.getBoundingClientRect().width, e.scrollWidth]);
    if (width === 1440) expect(w, 'the whole name at 1440').toBeGreaterThanOrEqual(full - 1);
    // At 1024 the mock's auto ratio pill is wider than prod's 1:1, so this only guards against the one-letter squeeze (prod shows about 67 px).
    else expect(w, 'more than a letter of the name at 1024').toBeGreaterThanOrEqual(24);
    const [b, run] = [(await bar.boundingBox())!, (await bar.getByRole('button', { name: /^Tạo ảnh/ }).boundingBox())!];
    expect(run.x + run.width, `Run inside the bar at ${width}`).toBeLessThanOrEqual(b.x + b.width - 16);
  }
  await modelButton(page).click();
  await expect(page.getByRole('dialog', { name: 'Chọn mô hình' }).locator('.badge-recommended').first()).toBeVisible();
});

test('the starter chips fold to one row, a +N chip unfolds the rest and folds them back, and a folded chip takes no Tab stop', async ({ page }) => {
  await signIn(page, 'pbarl');
  const starters = inSeason(STARTERS.image!);
  const total = starters.length;
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/image-generation');
    const group = page.getByRole('group', { name: 'Gợi ý nhanh' });
    const shown = group.getByRole('button'); // hidden chips leave the accessibility tree
    const more = group.getByRole('button', { name: /gợi ý nữa$/ });
    await expect(more, `the row overflows at ${width}`).toBeVisible();
    const past = Number((await more.innerText()).replace(/\D/g, ''));
    expect(past).toBeGreaterThan(0);
    await expect(shown).toHaveCount(total - past + 1);
    const tops = await shown.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `one row at ${width}`).toBe(1);
    const folded = group.locator('[data-past]').first();
    expect(await folded.evaluate((e: HTMLElement) => (e.focus(), document.activeElement === e))).toBe(false);

    await more.click();
    const less = group.getByRole('button', { name: 'Thu gọn' });
    await expect(less).toHaveAttribute('aria-expanded', 'true');
    await expect(shown).toHaveCount(total + 1);
    await expect(group.getByRole('button', { name: starters[total - 1]!.label, exact: true })).toBeVisible();
    await less.click();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(shown).toHaveCount(total - past + 1);
  }
  // A chip still fills the box, which hides the row.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/image-generation');
  await page.getByRole('group', { name: 'Gợi ý nhanh' }).getByRole('button').first().click();
  await expect(page.getByRole('group', { name: 'Gợi ý nhanh' })).toHaveCount(0);
  await expect(barOf(page).getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue(starters[0]!.text);
});

test('a photo file dropped anywhere on the bar goes into the strip, and the page stays put', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbarf');
  await page.goto('/image-generation');
  const bar = barOf(page);
  await expect(modelButton(page)).toContainText('Mock image E2E');
  const data = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'dropped.png', { type: 'image/png' }));
    return dt;
  }, png().toString('base64'));
  // On the prompt box, well away from the 48 px add tile.
  const box = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  await box.dispatchEvent('dragover', { dataTransfer: data });
  await expect(bar.locator('.slot')).toHaveAttribute('data-over', 'true');
  expect(await bar.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
  await box.dispatchEvent('drop', { dataTransfer: data });
  await expect(bar.getByRole('img', { name: 'dropped.png' })).toBeVisible();
  await expect(bar.locator('.slot')).toHaveAttribute('data-over', 'false');
  await expect(page).toHaveURL(/\/image-generation$/);
  await expect(box).toHaveValue(''); // the file went to the strip, not into the words

  // Moving from the box onto another part of the bar keeps the outline.
  await box.dispatchEvent('dragover', { dataTransfer: data });
  await box.dispatchEvent('dragleave', { dataTransfer: data, relatedTarget: await bar.getByRole('button', { name: 'Phong cách', exact: true }).elementHandle() });
  await expect(bar.locator('.slot')).toHaveAttribute('data-over', 'true');
  await box.dispatchEvent('dragleave', { dataTransfer: data });
  await expect(bar.locator('.slot')).toHaveAttribute('data-over', 'false');

  // A dialog opened from the bar sits inside it: a file dropped there does not land in the strip behind it.
  const count = bar.locator('.slot-count > [aria-hidden="true"]');
  await expect(count).toHaveText('1/4');
  await bar.getByRole('button', { name: 'Ảnh đã tải cho Ảnh tham chiếu' }).click();
  const photos = page.getByRole('dialog', { name: 'Ảnh đã tải' });
  await expect(photos).toBeVisible();
  await photos.dispatchEvent('dragover', { dataTransfer: data });
  await expect(bar.locator('.slot')).toHaveAttribute('data-over', 'false');
  await photos.dispatchEvent('drop', { dataTransfer: data });
  await page.keyboard.press('Escape');
  await expect(photos).toBeHidden();
  await expect(count).toHaveText('1/4');

  // A full strip shows no drop outline, and a drop on it says why nothing was added.
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles([2, 3, 4].map((n) => file(`full-${n}.png`)));
  await expect(count).toHaveText('4/4');
  await box.dispatchEvent('dragover', { dataTransfer: data });
  await expect(bar.locator('.slot')).toHaveAttribute('data-over', 'false');
  expect(await bar.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await box.dispatchEvent('drop', { dataTransfer: data });
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Tối đa 4 ảnh')).toBeVisible();
  await expect(count).toHaveText('4/4');
  await expect(page).toHaveURL(/\/image-generation$/);
});

test('a bar that grows past the screen leaves the foot and keeps the control in use in sight', async ({ page }) => {
  await signIn(page, 'pbari');
  for (const prompt of ['first picture for a long History', 'second picture for a long History']) {
    const made = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '3:4', prompt, enhance: false, params: { resolution: '1K' } } });
    expect(made.status()).toBe(201);
  }
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.map((j) => j.status).join(), { timeout: 60_000 }).toBe('succeeded,succeeded');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  const bar = barOf(page);
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem')).toHaveCount(2);
  await bar.getByRole('textbox', { name: 'Mô tả', exact: true }).fill(LONG);
  await openMore(page);
  // A screen just taller than the bar with its options open: opening the sent prompt makes the bar taller than the screen.
  const h = (await bar.boundingBox())!.height;
  await page.setViewportSize({ width: 1280, height: Math.round(h + 48 + 40) });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).not.toHaveAttribute('data-tall');
  const summary = bar.locator('.prompt-preview summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(bar).toHaveAttribute('data-tall');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('static');
  await expect(summary).toBeFocused();
  await expect(summary).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0); // the bar moved to the end of the page, and the page followed it
});

test('the more-options pill says what it holds: its count names the store and brand kit, the brand kit pushing the prompt over the limit is named, and a store list that fails opens it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbarj');
  // The seeded store with a brand kit, so this spec does not depend on store-brand.e2e filling it.
  await page.route(/\/api\/stores$/, async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { stores: { id: string }[] };
    for (const s of json.stores) if (s.id === 'store-brand') Object.assign(s, { brandVoice: 'Warm, plain words about cotton and linen.', brandTagline: 'Made by hand', brandColors: ['#112233'] });
    await route.fulfill({ response: res, json });
  });
  await page.goto('/image-generation');
  const bar = barOf(page);
  await expect(modelButton(page)).toContainText('Mock image E2E');
  const more = bar.getByRole('button', { name: /^Tuỳ chọn khác/ });
  await openMore(page);
  await selectText(page, 'Cửa hàng/Thương hiệu', 'E2E Brand Shop');
  await expect(more).toHaveAccessibleName('Tuỳ chọn khác 1 tuỳ chọn đang bật');
  await bar.getByRole('button', { name: 'Dùng bộ nhận diện', exact: true }).click();
  await expect(more).toHaveAccessibleName('Tuỳ chọn khác 2 tuỳ chọn đang bật');
  await expect(bar.locator('.imagebar-more-on')).toHaveAttribute('title', '2 tuỳ chọn đang bật: cửa hàng, bộ nhận diện');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  // Words that fit, which the folded brand kit pushes over the model's limit: Run's reason says the kit counts.
  const prompt = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  const limit = Number(await prompt.getAttribute('maxlength'));
  await prompt.fill('a'.repeat(limit - 5));
  await expect(bar.getByRole('button', { name: /^Tạo ảnh/ })).toBeDisabled();
  await expect(bar.locator('#imagegen-reason')).toHaveText(`Mô hình Mock image E2E nhận tối đa ${limit} ký tự (gồm bộ nhận diện), hãy rút gọn hoặc chọn mô hình khác.`);
  await page.unroute(/\/api\/stores$/);

  // A store list that does not load opens the options, so its error is seen.
  await page.route(/\/api\/stores$/, (route) => route.fulfill({ status: 500, json: { error: 'down' } }));
  await page.reload();
  await expect(bar.getByText('Không tải được danh sách cửa hàng.')).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.unroute(/\/api\/stores$/);
});

test('a card the keyboard reaches under the bar scrolls up into sight, a mouse click does not scroll, and at 1280x720 the first card keeps its actions reachable', async ({ page }) => {
  await signIn(page, 'pbard');
  const made = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '3:4', prompt: LONG, enhance: false, params: { resolution: '1K' } } });
  expect(made.status()).toBe(201);
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs[0]?.status, { timeout: 60_000 }).toBe('succeeded');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  const bar = barOf(page);
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').first();
  await expect(card.getByRole('button', { name: 'Dùng lại' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  // A mouse click on a control whose lower edge the bar covers: focus without the keyboard's ring, so the page does not move.
  const show = card.getByRole('button', { name: 'Yêu thích' });
  const top = (await bar.boundingBox())!.y;
  const s = (await show.boundingBox())!;
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(s.y + s.height - top - 4)));
  const before = await page.evaluate(() => window.scrollY);
  const m = (await show.boundingBox())!;
  await page.mouse.click(m.x + m.width / 2, m.y + 3);
  await expect(show).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);

  // The keyboard: every control of the card it reaches ends above the bar, scrolling the page when the bar covered it.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('tab', { name: 'Lịch sử' }).focus();
  let inCard = 0;
  for (let i = 0; i < 80 && inCard < 19; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const el = document.activeElement!;
      const side = el.closest('.side');
      const r = el.getBoundingClientRect();
      const b = document.querySelector('.imagebar')!.getBoundingClientRect();
      return side ? { bottom: r.bottom, barTop: b.top, name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30) } : null;
    });
    if (!at) continue;
    inCard++;
    expect(at.bottom, at.name).toBeLessThanOrEqual(at.barTop + 0.5);
  }
  expect(inCard).toBeGreaterThan(15);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0); // some control sat under the bar

  // Playwright's default screen: the first card's main actions can be reached, scrolled clear of the bar.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const name of ['Chạy lại', 'Dùng lại', 'Tải xuống', 'Xoá']) await card.getByRole('button', { name, exact: true }).click({ trial: true });
});

test('at 390 the prompt bar is the Tạo tab, in the page flow with its names and options shown and Run on screen, and the other tabs give the screen to their pane', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'pbarg');
  await page.goto('/image-generation');
  const bar = page.getByRole('tabpanel', { name: 'Tạo' });
  await expect(page.getByRole('tab')).toHaveText(['Tạo', 'Lịch sử', 'Ví dụ', 'Giới thiệu']);
  await expect(page.getByRole('tab', { name: 'Tạo' })).toHaveAttribute('aria-selected', 'true');
  await expect(bar).toHaveClass(/imagebar/);
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('static'); // not docked: the Tạo tab gives it the screen
  // As the old form: the names over the strip and the box, the store with its name, and no more-options pill (everything shows).
  for (const name of [bar.locator('.field-label', { hasText: 'Ảnh tham chiếu' }).first(), bar.getByText('Mô tả', { exact: true }), bar.locator('.field-label', { hasText: 'Cửa hàng/Thương hiệu' })]) {
    expect((await name.boundingBox())!.width).toBeGreaterThan(20);
  }
  await expect(bar.getByRole('button', { name: /^Tuỳ chọn khác/ })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Lưu thiết lập' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Khi nào dùng Tạo ảnh' })).toBeVisible();

  const prompt = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  const run = bar.getByRole('button', { name: /^Tạo ảnh/ });
  await fill(bar);
  await expect(run).toBeEnabled();
  // Run stays at the foot of the screen, as on the other tools: at the top of the page, with the bar running past the screen, and at its end.
  await page.evaluate(() => window.scrollTo(0, 0));
  const b = (await bar.boundingBox())!;
  expect(b.y + b.height).toBeGreaterThan(844); // the bar runs past the foot of the screen
  await expect(run).toBeInViewport({ ratio: 1 });
  expect(await uncovered(run)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(run).toBeInViewport({ ratio: 1 });
  expect(await uncovered(run)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect.soft(await blocking(page), 'the bar at 390').toEqual([]);

  // The hint belongs to the Tạo tab on a phone, as on the other tools.
  await openTab(page, 'Lịch sử');
  await expect(bar).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Khi nào dùng Tạo ảnh' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' })).toBeVisible();
  await openTab(page, 'Tạo');
  await expect(prompt).toHaveValue(LONG); // the bar keeps its words across the tabs
  await expect(bar.getByRole('img', { name: 'ref-3.png' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the prompt bar has no serious accessibility problem, filled, with its options and a menu open (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, scheme === 'light' ? 'pbarc' : 'pbarh'); // one account each: the same test picture from two workers would be one upload
    await page.goto('/image-generation');
    const bar = barOf(page);
    await expect(modelButton(page)).toContainText('Mock image E2E');
    expect.soft(await blocking(page), 'empty').toEqual([]);
    await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file(`axe-${scheme}.png`));
    await expect(bar.getByRole('img', { name: `axe-${scheme}.png` })).toBeVisible();
    await bar.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen shirt on a wooden chair');
    await openMore(page);
    await select(page, 'Độ phân giải').click();
    await expect(page.getByRole('listbox', { name: 'Độ phân giải' })).toBeVisible();
    expect.soft(await blocking(page), 'filled, with the options and a menu open').toEqual([]);
  });
}

test('two reference photos show one chip each that inserts its [ImageN] token into the prompt, in the order the photos are listed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbarf');
  await page.goto('/image-generation');
  const bar = barOf(page);
  const box = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  const chips = bar.getByRole('group', { name: 'Chèn ảnh vào mô tả:' });
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('only.png'));
  await expect(bar.getByRole('img', { name: 'only.png' })).toBeVisible();
  await expect(chips).toHaveCount(0);
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('second.png'));
  await expect(chips.getByRole('button')).toHaveCount(2);

  // An empty box that never had the focus: the token goes in, and the caret stays in the box after it.
  await chips.getByRole('button', { name: 'Ảnh 1: chèn [Image1] vào mô tả' }).click();
  await expect(box).toHaveValue('[Image1]');
  await expect(box).toBeFocused();
  await chips.getByRole('button', { name: 'Ảnh 2: chèn [Image2] vào mô tả' }).click();
  await expect(box).toHaveValue('[Image1] [Image2]');
  expect((await uncovered(chips.getByRole('button').first())), 'a chip nothing covers').toBe(true);
});

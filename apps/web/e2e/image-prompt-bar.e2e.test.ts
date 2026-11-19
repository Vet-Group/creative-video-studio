import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { modelButton, openMore, openTab, png, select, selectText, signIn } from './support.test';

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
    bar.getByRole('button', { name: 'Cải thiện mô tả bằng AI' }),
    bar.getByRole('button', { name: 'Gợi ý AI' }),
    bar.getByRole('button', { name: 'Mở rộng' }),
    bar.getByRole('button', { name: 'Phong cách', exact: true }),
    modelButton(page),
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

  // Before a prompt the reason is for screen readers and Run's description, not a line in the bar; a prompt of spaces alone gets the line.
  await expect(run).toBeDisabled();
  const reason = bar.locator('#imagegen-reason');
  await expect(reason).toHaveText('Nhập mô tả cảnh bạn muốn tạo.');
  await expect(reason).toHaveAttribute('data-quiet');
  await expect(run).toHaveAttribute('aria-describedby', 'imagegen-reason');
  await prompt.fill('   ');
  await expect(reason).not.toHaveAttribute('data-quiet');
  expect((await reason.boundingBox())!.width).toBeGreaterThan(100);

  // A reference photo shows as a thumbnail in the bar with its remove button, and the strip counts them against the model's limit.
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('bar-ref.png'));
  const thumb = bar.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' }).getByRole('img', { name: 'bar-ref.png' });
  await expect(thumb).toBeVisible();
  await expect(thumb).toBeInViewport();
  await expect(bar.locator('.imagebar-count')).toHaveText('1/4 ảnh tham chiếu');
  expect((await bar.locator('.imagebar-count').boundingBox())!.width).toBeGreaterThan(10);
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
  expect(order.slice(0, order.indexOf('Phong cách'))).toEqual(expect.arrayContaining(['Cải thiện mô tả bằng AI', 'Gợi ý AI', 'Mở rộng']));
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
  await page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('button', { name: 'Chép vào ô mô tả' }).first().click();
  const toast = page.getByRole('region', { name: 'Thông báo' }).getByText('Đã chép mô tả');
  await expect(toast).toBeVisible();
  expect((await toast.boundingBox())!.y).toBeLessThan(100);
});

test('the bar comes first for the keyboard: a few Tabs from the page tabs reach the prompt, not the whole gallery, and Run says the page is loading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbare');
  // Run says the page is still loading while the model list is on its way.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/image-models/, async (route) => (await held, route.continue()));
  await page.goto('/image-generation');
  const bar = barOf(page);
  await expect(bar.getByRole('button', { name: /^Tạo ảnh/ })).toContainText('Đang tải…');
  release();
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(bar.getByRole('button', { name: /^Tạo ảnh/ })).not.toContainText('Đang tải…');
  await page.unroute(/\/api\/image-models/);

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
    // The model's name may be cut, never hidden.
    expect((await modelButton(page).locator('.select-value-text').boundingBox())!.width, `model name at ${width}`).toBeGreaterThan(40);
  }
  // A screen shorter than the bar: the bar leaves the foot for the page's flow, so its top can be scrolled to.
  const bar = barOf(page);
  const h = (await bar.boundingBox())!.height;
  await page.setViewportSize({ width: 1440, height: Math.round(h + 40) });
  await expect(bar).toHaveAttribute('data-tall');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('static');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(bar).not.toHaveAttribute('data-tall');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
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
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('phone-ref.png'));
  await expect(bar.getByRole('img', { name: 'phone-ref.png' })).toBeVisible();
  await prompt.fill('a linen shirt on a wooden chair');
  await expect(run).toBeEnabled();
  await run.scrollIntoViewIfNeeded();
  await expect(run).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect.soft(await blocking(page), 'the bar at 390').toEqual([]);

  // The hint belongs to the Tạo tab on a phone, as on the other tools.
  await openTab(page, 'Lịch sử');
  await expect(bar).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Khi nào dùng Tạo ảnh' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' })).toBeVisible();
  await openTab(page, 'Tạo');
  await expect(prompt).toHaveValue('a linen shirt on a wooden chair'); // the bar keeps its words across the tabs
  await expect(bar.getByRole('img', { name: 'phone-ref.png' })).toBeVisible();
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

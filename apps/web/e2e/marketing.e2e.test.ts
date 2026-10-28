import { expect, type Page, test } from '@playwright/test';
import { HOOKS, LOCATIONS } from '../src/lib/marketing';
import { jpg, modelButton, png, select, selectValue, signIn } from './support.test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const reasonOf = (page: Page) => page.locator('.form-message').getByRole('status');
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const hook = HOOKS.find((h) => h.id === 'dramatic-arrival')!;
const spot = LOCATIONS.find((l) => l.id === 'kitchen')!;

async function openPage(page: Page): Promise<void> {
  await nav(page).getByRole('link', { name: 'Marketing Studio' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  await expect(runButton(page)).toBeVisible();
}

test('a mock marketing job runs from two photos, a hook and a location, and shows in Lịch sử, Ví dụ and the Library under Marketing Studio', async ({ page }) => {
  await signIn(page, 'mkta');
  await openPage(page);
  await expect(nav(page).getByRole('link', { name: 'Marketing Studio' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.app-head strong')).toHaveText('UGC Thử đồ');
  // The format picker, as on the live page: UGC and Advanced are built (marketing-advanced.e2e.test.ts); the other two are shown but cannot be picked yet.
  await page.getByRole('button', { name: 'Đổi định dạng' }).click();
  const formats = page.getByRole('dialog', { name: 'Chọn định dạng' });
  await expect(formats.getByRole('button', { name: /^(UGC Thử đồ|Nâng cao|Mở hộp|Đánh giá sản phẩm)/ })).toHaveCount(4);
  await expect(formats.getByRole('button', { name: 'UGC Thử đồ' })).toHaveAttribute('aria-pressed', 'true');
  await expect(formats.getByRole('button', { disabled: true })).toHaveCount(2);
  await formats.getByRole('button', { name: 'UGC Thử đồ' }).click();
  await expect(formats).toBeHidden();
  await expect(page.locator('.slot')).toHaveCount(2);
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '9:16');
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh người mẫu.');

  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(page.getByRole('img', { name: 'model.png' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh sản phẩm.');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(runButton(page)).toBeEnabled();

  // Hook: the box opens a dialog of text cards by keyboard, the arrows move between them, Enter picks, Escape closes without a change.
  const hookBox = page.getByRole('button', { name: /^Hook/ });
  await expect(hookBox).toContainText('Chưa chọn');
  expect(await hookBox.locator('.choice-label').evaluate((el) => (el as HTMLElement).innerText)).toBe('Hook\n(tuỳ chọn)'); // two lines, as on Fash
  await hookBox.focus();
  await page.keyboard.press('Enter');
  const hooks = page.getByRole('dialog', { name: 'Chọn hook' });
  await expect(hooks).toBeVisible();
  const cards = hooks.getByRole('option');
  await expect(cards).toHaveCount(HOOKS.length + 1);
  await expect(cards.first()).toHaveText('Không chọn');
  await expect(cards.first()).toBeFocused();
  await expect(cards.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(hooks).toBeHidden();
  await expect(hookBox).toContainText('Chưa chọn');
  await expect(hookBox).toBeFocused();

  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await expect(cards.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(cards.first()).toBeFocused();
  await hooks.getByRole('option', { name: hook.name, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(hooks).toBeHidden();
  await expect(hookBox).toContainText(hook.name);
  await hookBox.click();
  await expect(hooks.getByRole('option', { name: hook.name, exact: true })).toHaveAttribute('aria-selected', 'true');
  await hooks.getByRole('option', { name: 'Không chọn' }).click(); // the first card clears the choice
  await expect(hookBox).toContainText('Chưa chọn');
  await hookBox.click();
  await hooks.getByRole('option', { name: hook.name, exact: true }).click();
  await expect(hookBox).toContainText(hook.name);

  // Location: the same picker, with the mouse.
  const locationBox = page.getByRole('button', { name: /^Bối cảnh/ });
  await locationBox.click();
  const places = page.getByRole('dialog', { name: 'Chọn bối cảnh' });
  await expect(places.getByRole('option')).toHaveCount(LOCATIONS.length + 1);
  await places.getByRole('option', { name: spot.name, exact: true }).click();
  await expect(locationBox).toContainText(spot.name);

  await page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' }).fill('soft morning light');
  // The folded preview shows the English prompt Run is about to send.
  await page.getByText('Xem prompt gửi đi').click();
  const preview = page.locator('.prompt-preview p');
  await expect(preview).toContainText(' soft morning light Natural sound recorded on the phone:');
  const shown = await preview.innerText();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('complementary', { name: 'Job của tôi' }).getByText('Hoàn tất')).toHaveCount(1);

  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string; ratio: string; durationSec: number }[] };
  expect(jobs.jobs.map((j) => [j.feature, j.ratio])).toEqual([['marketing', '9:16']]);
  const detail = (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as { prompt: string; presetId: string | null; images: { filename: string }[] };
  expect(detail.images.map((i) => i.filename)).toEqual(['model.png', 'product.png']);
  expect(detail.presetId).toBeNull();
  expect(detail.prompt).toBe(shown);
  expect(detail.prompt).toContain('[Image1]');
  expect(detail.prompt).toContain(hook.phrase);
  expect(detail.prompt).toContain(`Set in ${spot.phrase}.`);
  // The member's text comes last before the sound rule; audio is on by default, as on Fash.
  expect(detail.prompt).toContain(' soft morning light Natural sound recorded on the phone:');
  // The form's own inputs are kept for Dùng lại.
  expect(await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()).toMatchObject({ hook: hook.id, location: spot.id, brief: 'soft morning light', format: null });

  // Ví dụ lists the company's marketing clips as videos.
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  const gallery = page.getByRole('group', { name: 'Video Marketing Studio của công ty' });
  await expect(gallery.locator('video').first()).toBeVisible();
  await expect.poll(() => gallery.locator('video').first().evaluate((v: HTMLVideoElement) => v.readyState >= 1)).toBe(true);

  await nav(page).getByRole('link', { name: 'Thư viện' }).click();
  const chip = page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: 'Marketing Studio', exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const mine = page.getByRole('article').filter({ hasText: 'E2E Mkt A' });
  await expect(mine).toHaveCount(1);
  await expect(mine.getByText('Marketing Studio', { exact: true })).toBeVisible();
});

test('the model, ratio and duration come from the marketing model, the About tab says what is missing, and a refused Run shows its message', async ({ page }) => {
  await signIn(page, 'mktb');
  await openPage(page);
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(runButton(page)).toBeEnabled();
  await expect(select(page, 'Thời lượng')).toBeVisible();
  await select(page, 'Thời lượng').click();
  await expect(page.getByRole('listbox', { name: 'Thời lượng' }).getByRole('option')).toHaveText(['5 giây', '8 giây', '10 giây']); // what any marketing model offers
  await page.keyboard.press('Escape');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '9:16');
  await expect(select(page, 'Tỉ lệ').locator('.select-value')).toHaveText('9:16'); // the half-width field shows the bare ratio, the menu names it
  await select(page, 'Tỉ lệ').click();
  await expect(page.getByRole('listbox', { name: 'Tỉ lệ' }).getByRole('option')).toHaveText(['9:16 (dọc)', '16:9 (ngang)', '1:1 (vuông)']);
  await page.keyboard.press('Escape');

  await page.route(/\/api\/jobs$/, (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 429, json: { error: 'Bạn đã dùng hết số clip trong ngày hôm nay' } }) : r.fallback()));
  await runButton(page).click();
  await expect(page.locator('.form-message').getByRole('alert')).toHaveText('Bạn đã dùng hết số clip trong ngày hôm nay');

  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('heading', { level: 2, name: /UGC Thử đồ/ })).toBeVisible();
  await expect(page.getByText(/chưa được xây dựng/)).toBeVisible();
});

test('a second model with other ratios and durations can be picked: the menus offer the options of both models and the job stores the ratio and duration', async ({ page }) => {
  await signIn(page, 'mktc');
  await openPage(page);
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '9:16');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5'); // the first model's own first duration; 10 s was only the start
  await expect(runButton(page)).toBeEnabled();

  // A ratio only the other model offers: the chosen model is unsupported, Run says so, and the picker offers the other one.
  const pick = (name: RegExp) => page.getByRole('option', { name });
  await selectValue(page, 'Tỉ lệ', '16:9');
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText(/Mô hình này không có tỉ lệ hoặc thời lượng đã chọn/);
  await modelButton(page).click();
  await expect(pick(/Mock E2E Wide/)).toBeEnabled();
  await pick(/Mock E2E Wide/).click();
  await expect(modelButton(page)).toContainText('Mock E2E Wide');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '16:9');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '10'); // moved to the model's own duration
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; ratio: string; durationSec: number; modelId: string }[] }).jobs.map((j) => [j.feature, j.modelId, j.ratio, j.durationSec])).toEqual([['marketing', 'mock-e2e-wide', '16:9', 10]]);

  // Back to the first model: the ratio and the duration move to its own.
  await modelButton(page).click();
  await pick(/Mock E2E(?! Wide)/).click();
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '9:16');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');
});

test('the brief may take what the chosen model leaves; a switch to a model with a smaller limit keeps the text and Run waits with the reason', async ({ page }) => {
  await signIn(page, 'mktp');
  await openPage(page);
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(modelButton(page)).toContainText('Mock E2E');
  const brief = page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' });
  const counter = page.locator('.prompt-foot span').first();
  const room = async () => Number((await counter.textContent())!.split('/')[1]);
  await expect(counter).toHaveText(/^0\/\d+$/);
  expect(await room()).toBeGreaterThan(1100); // 2000 less the fixed part the page adds
  const text = 'x'.repeat(1100);
  await brief.fill(text);
  await expect(runButton(page)).toBeEnabled();

  // Mock E2E Wide takes 1000 characters: the text stays as written and Run waits.
  await selectValue(page, 'Tỉ lệ', '16:9');
  await modelButton(page).click();
  await page.getByRole('option', { name: /Mock E2E Wide/ }).click();
  await expect(modelButton(page)).toContainText('Mock E2E Wide');
  await expect(brief).toHaveValue(text);
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Mô hình Mock E2E Wide nhận tối đa 1000 ký tự, hãy rút gọn hoặc chọn mô hình khác.');
  expect(await room()).toBeLessThan(1000);

  await brief.fill('x'.repeat(await room()));
  await expect(runButton(page)).toBeEnabled();
  await expect(brief).toHaveAttribute('maxlength', String(await room()));
});

test('a failed model list can be retried', async ({ page }) => {
  await signIn(page, 'mktb');
  let failing = true;
  await page.route(/\/api\/models\?feature=marketing/, (r) => (failing ? r.abort() : r.fallback()));
  await openPage(page);
  await expect(reasonOf(page)).toHaveText('Không tải được danh sách mô hình.');
  failing = false;
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh người mẫu.');
});

test('with no enabled marketing model Run is disabled and says the app is not enabled', async ({ page }) => {
  await signIn(page, 'mktb');
  await page.route(/\/api\/models\?feature=marketing/, (r) => r.fulfill({ json: { models: [], defaultModelId: null, monthToDate: { usd: '0.0000', provisional: false } } }));
  await openPage(page);
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Marketing Studio chưa được Admin bật');
  await expect(runButton(page)).toBeDisabled();
});

for (const [width, height] of [[390, 844], [1024, 768], [1440, 1000]] as const) {
  test(`at ${width} px the page fits the width in every tab`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, 'mktb');
    await page.goto('/marketing-studio');
    await expect(page.getByRole('tab').first()).toBeVisible();
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      expect(await fits(page), (await tab.textContent()) ?? '').toBe(true);
    }
    if (width === 390) {
      await expect(page.getByRole('tab')).toHaveText(['Tạo', 'Lịch sử', 'Ví dụ', 'Giới thiệu']);
      await page.getByRole('tab', { name: 'Tạo' }).click();
      const run = (await runButton(page).boundingBox())!;
      expect(run.y + run.height).toBeLessThanOrEqual(height);
      expect(run.x + run.width).toBeLessThanOrEqual(width);
      // A picker dialog stays inside the screen.
      await page.getByRole('button', { name: /^Hook/ }).click();
      const dialog = (await page.getByRole('dialog', { name: 'Chọn hook' }).boundingBox())!;
      expect(dialog.x).toBeGreaterThanOrEqual(0);
      expect(dialog.x + dialog.width).toBeLessThanOrEqual(width);
      expect(dialog.y + dialog.height).toBeLessThanOrEqual(height);
      expect(await fits(page)).toBe(true);
    }
  });
}

test('with stock models uploaded, the empty model slot opens the stock model dialog: a stock model or an own photo fills the slot', async ({ page }) => {
  const names = ['marketing-model-1.png', 'marketing-model-2.png', 'marketing-model-10.png'];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) expect((await each(name)).ok()).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: png(), headers: { 'content-type': 'image/png' } }));
  try {
    await signIn(page, 'mktc');
    await page.goto('/marketing-studio');
    const dialog = page.getByRole('dialog', { name: 'Chọn người mẫu' });
    // The slot offers the dialog once the sample list is in; before that a click opens the file picker, so click until it shows.
    await expect(async () => {
      await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    // The stock models in number order (10 after 2), after the own-photo tile.
    await expect(dialog.getByRole('button', { name: /^Người mẫu có sẵn/ })).toHaveCount(3);
    await expect(dialog.getByRole('button', { name: 'Người mẫu có sẵn 1' }).locator('img')).toHaveAttribute('src', '/api/samples/marketing-model-1.png');
    await expect(dialog.getByRole('button', { name: 'Người mẫu có sẵn 3' }).locator('img')).toHaveAttribute('src', '/api/samples/marketing-model-10.png');
    await dialog.getByRole('button', { name: 'Người mẫu có sẵn 2' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'marketing-model-2.png' })).toBeVisible();

    // Removing it brings the dialog back; the own-photo tile uploads like the slot's file input.
    await page.getByRole('button', { name: 'Bỏ ảnh marketing-model-2.png' }).click();
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    await dialog.getByLabel('Tải lên ảnh của bạn').setInputFiles(file('mine.png'));
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'mine.png' })).toBeVisible();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('hook variants: up to 3 hooks make one clip each, with the total, the daily clip use and a confirm first, and a refused variant is listed', async ({ page }) => {
  const picks = HOOKS.slice(0, 4);
  await signIn(page, 'mktf');
  await page.goto('/marketing-studio');
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await page.getByRole('button', { name: /^Hook/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Chọn hook' });
  await dialog.getByLabel(/^Tạo nhiều biến thể/).check();
  for (const h of picks) await dialog.getByRole('option', { name: h.name, exact: true }).click();
  // The fourth pick is ignored: three at most, and a picked card shows as selected.
  await expect(dialog.getByRole('option', { selected: true })).toHaveCount(3);
  await expect(dialog.getByRole('option', { name: picks[3]!.name, exact: true })).toHaveAttribute('aria-selected', 'false');
  await dialog.getByRole('button', { name: 'Xong (3/3)' }).click();
  await expect(page.getByRole('button', { name: /^Hook/ })).toContainText(`3 biến thể: ${picks.slice(0, 3).map((h) => h.name).join(', ')}`);

  // Before Run: the clip count and total on the button, the daily clip use, and one prompt per variant in the preview.
  await expect(runButton(page)).toContainText('3 clip');
  await expect(runButton(page)).toContainText('$0.0000'); // the mock model books 0 USD, so 3 x 0
  await expect(page.locator('.variants-usage')).toContainText(/3 biến thể, tổng \$0\.0000: dùng 3 trong \d+ clip mỗi ngày của bạn \(hôm nay đã dùng 0\)/);
  await page.getByText('Xem prompt gửi đi').click();
  await expect(page.locator('.prompt-preview p')).toHaveCount(3);
  for (const [i, h] of picks.slice(0, 3).entries()) await expect(page.locator('.prompt-preview p').nth(i)).toContainText(h.phrase);

  // Dismissing the confirm sends nothing.
  page.once('dialog', (d) => void d.dismiss());
  await runButton(page).click();
  await expect(page.getByText(/Đã gửi/)).toHaveCount(0);

  // The server refuses the second variant (as when a cap is reached meanwhile); the other two go, one after another, and the refusal is named.
  let posts = 0;
  await page.route('**/api/jobs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    if (posts === 2) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Bạn đã dùng hết số clip trong ngày hôm nay' }) });
    return route.continue();
  });
  page.once('dialog', (d) => {
    expect(d.message()).toContain('Tạo 3 clip');
    void d.accept();
  });
  await runButton(page).click();
  await expect(page.getByText(`Đã gửi 2/3 biến thể: ${picks[0]!.name}, ${picks[2]!.name}.`)).toBeVisible();
  await expect(page.locator('.form-message').getByRole('alert')).toContainText(`Không gửi được ${picks[1]!.name}: Bạn đã dùng hết số clip trong ngày hôm nay`);
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[]; clips: { today: number } };
  expect(jobs.jobs).toHaveLength(2);
  const hooks = await Promise.all(jobs.jobs.map(async (j) => ((await (await page.request.get(`/api/jobs/${j.id}`)).json()) as { hook: string }).hook));
  expect(hooks.sort()).toEqual([picks[0]!.id, picks[2]!.id].sort());
  expect(jobs.clips.today).toBe(2);
});

test('hook variants beyond the clips left today are refused before anything is sent', async ({ page }) => {
  await signIn(page, 'mktf');
  // The tray says one clip is left today.
  await page.route('**/api/jobs?mine', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { clips: { today: number; cap: number } };
    await route.fulfill({ response: res, json: { ...body, clips: { today: body.clips.cap - 1, cap: body.clips.cap } } });
  });
  await page.goto('/marketing-studio');
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await page.getByRole('button', { name: /^Hook/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Chọn hook' });
  await dialog.getByLabel(/^Tạo nhiều biến thể/).check();
  for (const h of HOOKS.slice(0, 2)) await dialog.getByRole('option', { name: h.name, exact: true }).click();
  await dialog.getByRole('button', { name: 'Xong (2/3)' }).click();
  await expect(reasonOf(page)).toHaveText('Hôm nay bạn chỉ còn 1 clip; bỏ bớt biến thể hook.');
  await expect(runButton(page)).toBeDisabled();
  // Turning variants off keeps the first hook and lets one clip go.
  await page.getByRole('button', { name: /^Hook/ }).click();
  await dialog.getByLabel(/^Tạo nhiều biến thể/).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Hook/ })).toContainText(HOOKS[0]!.name);
  await expect(runButton(page)).toBeEnabled();
});

test('as on Fash, a filled photo slot and a chosen hook or location show the picture full size under a name chip, with an X to clear', async ({ page }) => {
  const names = [`marketing-hook-${hook.id}.jpg`];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) expect((await each(name)).ok()).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: jpg(), headers: { 'content-type': 'image/jpeg' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'mktb');
    await page.goto('/marketing-studio');
    await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
    const slot = page.getByRole('group', { name: 'Sản phẩm' });
    const photo = slot.getByRole('img', { name: 'product.png' });
    await expect(photo).toBeVisible();
    await expect(slot.locator('.slot-chip')).toHaveText('Sản phẩm');
    const [box, img] = [(await slot.boundingBox())!, (await photo.boundingBox())!];
    expect(img.width).toBeGreaterThan(box.width - 4); // fills the tile, not a 56 px thumbnail
    expect(img.height).toBeGreaterThan(box.height - 4);

    const hookBox = page.getByRole('button', { name: /^Hook/ });
    await hookBox.click();
    await page.getByRole('dialog', { name: 'Chọn hook' }).getByRole('option', { name: hook.name, exact: true }).click();
    await expect(hookBox.locator('img')).toHaveAttribute('src', `/api/samples/marketing-hook-${hook.id}.jpg`);
    await expect(hookBox.locator('.choice-value')).toHaveText(hook.name);
    await page.getByRole('button', { name: 'Bỏ Hook' }).click();
    await expect(hookBox.locator('img')).toHaveCount(0);
    await expect(hookBox).not.toContainText(hook.name);

    // A choice without an uploaded sample keeps the plain box with the name.
    const placeBox = page.getByRole('button', { name: /^Bối cảnh/ });
    await placeBox.click();
    await page.getByRole('dialog', { name: 'Chọn bối cảnh' }).getByRole('option', { name: LOCATIONS.find((l) => l.id === 'kitchen')!.name, exact: true }).click();
    await expect(placeBox.locator('img, video')).toHaveCount(0);
    await expect(placeBox).toContainText(LOCATIONS.find((l) => l.id === 'kitchen')!.name);
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test("with earlier UGC jobs, the empty product slot offers the member's own past products (Fash's My Products)", async ({ page }) => {
  await signIn(page, 'mktg');
  const upload = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: file(name) } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const res = await page.request.post('/api/jobs', { data: { feature: 'marketing', assetIds: [await upload('old-model.png'), await upload('old-product.png')], modelId: 'mock-e2e', prompt: 'p', ratio: '9:16', durationSec: 5, params: { audio: 'off' } } });
  expect(res.status()).toBe(201);

  await page.goto('/marketing-studio');
  const dialog = page.getByRole('dialog', { name: 'Chọn sản phẩm' });
  // The slot offers the dialog once the list is in; before that a click opens the file picker, so click until it shows.
  await expect(async () => {
    await page.getByRole('button', { name: 'Tải lên Sản phẩm' }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(dialog.getByRole('button', { name: /^Dùng lại / })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Dùng lại old-product.png' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Sản phẩm: ảnh đã chọn').getByRole('img', { name: 'old-product.png' })).toBeVisible();
  // Removing the product only empties the slot.
  await page.getByRole('button', { name: 'Bỏ ảnh old-product.png' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

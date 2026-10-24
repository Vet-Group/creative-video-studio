import { expect, type Page, test } from '@playwright/test';
import { HOOKS, LOCATIONS } from '../src/lib/marketing';
import { modelButton, png, select, selectValue, signIn } from './support.test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const reasonOf = (page: Page) => page.locator('.form-message').getByRole('status');
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const hook = HOOKS.find((h) => h.id === 'mirror-check')!;
const spot = LOCATIONS.find((l) => l.id === 'cafe')!;

async function openPage(page: Page): Promise<void> {
  await nav(page).getByRole('link', { name: 'Marketing Studio' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  await expect(runButton(page)).toBeVisible();
}

test('a mock marketing job runs from two photos, a hook and a location, and shows in Lịch sử, Ví dụ and the Library under Marketing Studio', async ({ page }) => {
  await signIn(page, 'mkta');
  await openPage(page);
  await expect(nav(page).getByRole('link', { name: 'Marketing Studio' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.app-head')).toHaveText('UGC Thử đồ');
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
  expect(detail.prompt).toContain('[Image1]');
  expect(detail.prompt).toContain(hook.phrase);
  expect(detail.prompt).toContain(`Set in ${spot.phrase}.`);
  expect(detail.prompt.endsWith(' soft morning light')).toBe(true);

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
  await select(page, 'Tỉ lệ').click();
  await expect(page.getByRole('listbox', { name: 'Tỉ lệ' }).getByRole('option')).toHaveText(['9:16 (dọc)', '16:9 (ngang)', '1:1 (vuông)']);
  await page.keyboard.press('Escape');

  await page.route(/\/api\/jobs$/, (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 429, json: { error: 'Bạn đã dùng hết số clip trong ngày hôm nay' } }) : r.fallback()));
  await runButton(page).click();
  await expect(page.locator('.form-message').getByRole('alert')).toHaveText('Bạn đã dùng hết số clip trong ngày hôm nay');

  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('heading', { name: /UGC Thử đồ/ })).toBeVisible();
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

import { expect, type Page, test } from '@playwright/test';
import { HOOKS, LOCATIONS } from '../src/lib/marketing';
import { modelButton, png, signIn } from './support.test';

// Marketing Studio Advanced on the mock models (e2e/serve.ts): Mock E2E takes 4 images and, being the mock endpoint, the audio switch at 0 USD;
// Mock E2E Wide takes 2.
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const reasonOf = (page: Page) => page.locator('.form-message').getByRole('status');
const brief = (page: Page) => page.getByRole('textbox', { name: 'Prompt', exact: true });
/** The file input of the reference slot; the slot group and its upload button carry the same name. */
const refsInput = (page: Page) => page.getByRole('group', { name: 'Ảnh tham chiếu' }).getByLabel('Ảnh tham chiếu', { exact: true });
const script = (page: Page) => page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' });
const audio = (page: Page) => page.getByRole('switch', { name: 'Tạo âm thanh' });
const hook = HOOKS.find((h) => h.id === 'product-catch')!;
const spot = LOCATIONS.find((l) => l.id === 'bedroom')!;

async function openAdvanced(page: Page): Promise<void> {
  await nav(page).getByRole('link', { name: 'Marketing Studio' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  await page.getByRole('button', { name: 'Đổi định dạng' }).click();
  const formats = page.getByRole('dialog', { name: 'Chọn định dạng' });
  await expect(formats.getByRole('button', { name: 'Nâng cao' })).toBeEnabled();
  await expect(formats.getByRole('button', { disabled: true })).toHaveCount(2); // Unboxing and Product Review are still to come
  await formats.getByRole('button', { name: 'Nâng cao' }).click();
  await expect(page).toHaveURL(/\/marketing-studio\/advanced$/);
  await expect(page.locator('.app-head strong')).toHaveText('Nâng cao');
}

test('an Advanced job runs from reference images, a brief, a script and audio on, and is filed under Nâng cao in the Library', async ({ page }) => {
  await signIn(page, 'mktd');
  await openAdvanced(page);
  await expect(nav(page).getByRole('link', { name: 'Marketing Studio' })).toHaveAttribute('aria-current', 'page');
  // One wide reference slot, the hook and location boxes, the brief, the script and the audio switch, on by default.
  await expect(page.locator('.slot')).toHaveCount(1);
  await expect(page.getByText('Tối đa 4 ảnh tham chiếu')).toBeVisible(); // Mock E2E takes 4
  // As on Fash, the hook and location boxes share the row under the wide slot.
  const [hookBox, placeBox] = await Promise.all([/^Hook/, /^Bối cảnh/].map((name) => page.getByRole('button', { name }).boundingBox()));
  expect(Math.abs(hookBox!.y - placeBox!.y)).toBeLessThan(1);
  expect(placeBox!.x).toBeGreaterThan(hookBox!.x + hookBox!.width - 1);
  await expect(page.getByRole('button', { name: /^Hook/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Bối cảnh/ })).toBeVisible();
  await expect(brief(page)).toHaveAttribute('placeholder', 'Mô tả video marketing bạn muốn…');
  await expect(script(page)).toBeVisible();
  await expect(page.locator('.script-foot')).toHaveCount(0); // empty, the script box is as short as the live page's
  await expect(audio(page)).toHaveAttribute('aria-checked', 'true');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(runButton(page)).toContainText('$0.0000');

  // Run waits for an image, then for the brief.
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ít nhất 1 ảnh tham chiếu.');
  await refsInput(page).setInputFiles([file('model.png'), file('product.png'), file('style.png')]);
  await expect(page.getByRole('img', { name: 'style.png' })).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Viết prompt mô tả video bạn muốn.');
  await expect(runButton(page)).toBeDisabled();
  await brief(page).fill('   ');
  await expect(runButton(page)).toBeDisabled();
  await brief(page).fill('The first image is the model, the second the sneakers, the third the look.');
  await expect(runButton(page)).toBeEnabled();

  // A model that takes fewer references than are chosen cannot be picked.
  await modelButton(page).click();
  await expect(page.getByRole('option', { name: /Mock E2E Wide/ })).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Hook/ }).click();
  await page.getByRole('dialog', { name: 'Chọn hook' }).getByRole('option', { name: hook.name, exact: true }).click();
  await page.getByRole('button', { name: /^Bối cảnh/ }).click();
  await page.getByRole('dialog', { name: 'Chọn bối cảnh' }).getByRole('option', { name: spot.name, exact: true }).click();
  await script(page).fill('These are so comfy. Grab yours today!');
  await expect(page.getByText('7 từ, khoảng 4 giây')).toBeVisible();

  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });

  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  expect(jobs.jobs.map((j) => j.feature)).toEqual(['marketing']);
  const detail = (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as { prompt: string; images: { filename: string }[] };
  expect(detail.images.map((i) => i.filename)).toEqual(['model.png', 'product.png', 'style.png']);
  expect(detail.prompt).toContain('Brief: The first image is the model');
  expect(detail.prompt).toContain('[Image1], [Image2], [Image3]');
  expect(detail.prompt).toContain(hook.phrase);
  expect(detail.prompt).toContain(`Set in ${spot.phrase}.`);
  expect(detail.prompt).toContain('The speaker says exactly: "These are so comfy. Grab yours today!"');

  await nav(page).getByRole('link', { name: 'Thư viện' }).click();
  const kinds = page.getByRole('group', { name: 'Loại' });
  const mine = page.getByRole('article').filter({ hasText: 'E2E Mkt D' });
  await kinds.getByRole('button', { name: 'Nâng cao', exact: true }).click();
  await expect(mine).toHaveCount(1);
  await kinds.getByRole('button', { name: 'UGC Thử đồ', exact: true }).click();
  await expect(mine).toHaveCount(0);
  await kinds.getByRole('button', { name: 'Marketing Studio', exact: true }).click();
  await expect(mine).toHaveCount(1);
});

test('audio off makes a silent job, the reference slot stops at the model cap, and the About tab explains the script rules', async ({ page }) => {
  await signIn(page, 'mktd');
  await page.goto('/marketing-studio/advanced');
  await expect(runButton(page)).toBeVisible();
  await expect(modelButton(page)).toContainText('Mock E2E'); // the cap is the chosen model's, known once the list is in
  await refsInput(page).setInputFiles([1, 2, 3, 4, 5].map((n) => file(`ref-${n}.png`)));
  await expect(page.locator('.slot-thumbs li')).toHaveCount(4); // Mock E2E takes 4; the fifth is dropped
  await brief(page).fill('A quiet product shot.');
  await script(page).fill('Never spoken');
  await audio(page).click();
  await expect(audio(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.switch-row')).toContainText('Tắt');
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] };
  const detail = (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as { prompt: string };
  expect(detail.prompt).toContain('The video is completely silent');
  expect(detail.prompt).not.toContain('Never spoken');

  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('heading', { name: /Nâng cao/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'UGC Thử đồ hay Nâng cao?' })).toBeVisible();
  await expect(page.getByText(/Khoảng hai từ mỗi giây/)).toBeVisible();
});

test('the format picker goes back to UGC Thử đồ from Advanced', async ({ page }) => {
  await signIn(page, 'mktd');
  await page.goto('/marketing-studio/advanced');
  await page.getByRole('button', { name: 'Đổi định dạng' }).click();
  const formats = page.getByRole('dialog', { name: 'Chọn định dạng' });
  await expect(formats.getByRole('button', { name: 'Nâng cao' })).toHaveAttribute('aria-pressed', 'true');
  await formats.getByRole('button', { name: 'UGC Thử đồ' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  await expect(page.locator('.slot')).toHaveCount(2);
});

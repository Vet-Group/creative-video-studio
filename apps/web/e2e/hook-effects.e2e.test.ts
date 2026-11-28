import { expect, type Page, test } from '@playwright/test';
import { HOOK_EFFECTS, hookEffectPrompt } from '../src/lib/apps';
import { inSeason } from '../src/lib/prompt-starters';
import { modelButton, png, signIn } from './support.test';

// The hook effects app on the two mock models of e2e/serve.ts (mock provider, the real endpoints): one photo, the effects of the season, a 5 s vertical clip that ends on the photo.
// A mock job books $0, so the page shows $0 here; the prices of the real rows are checked in api/jobs/hook-effect.test.ts.
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy(?! lại)/ }); // not a History card's rerun button
const reason = (page: Page) => page.locator('.form-message').getByRole('status');
const effects = (page: Page) => page.getByRole('radiogroup', { name: 'Hiệu ứng' });

type Job = { id: string; feature: string; status: string; effect: string | null };
const mine = async (page: Page) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: Job[] }).jobs.filter((j) => j.feature === 'hook_effect');

test('hook effects: the form, a Run of the box burst, its job, Reuse and the Library chip', async ({ page }) => {
  await signIn(page, 'hooka');
  await page.goto('/apps');
  await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: 'Hiệu ứng mở đầu' }).click();
  await expect(page).toHaveURL(/\/apps\/hook-effects$/);

  // The form: one product slot, the effects of the season (the two Christmas ones lead from 15 November to 31 December) with the first picked, and no prompt, ratio,
  // length, audio or model control.
  await expect(page.getByRole('tab')).toHaveText(['Lịch sử', 'Giới thiệu']);
  await expect(effects(page).getByRole('radio')).toHaveCount(inSeason(HOOK_EFFECTS).length);
  await expect(effects(page).getByRole('radio').first()).toBeChecked();
  for (const label of ['Phồng rồi bóp', 'Tan chảy thành sản phẩm', 'Rơi vào khung', 'Hộp bung mở']) await expect(effects(page).getByRole('radio', { name: label })).toHaveCount(1);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(modelButton(page)).toHaveCount(0);
  await expect(page.locator('#app-panel-create').getByText('Clip có sẵn âm thanh do mô hình tự tạo')).toBeVisible(); // the About tab repeats it
  await expect(reason(page)).toHaveText('Tải lên ảnh: Sản phẩm.');
  await expect(runButton(page)).toBeDisabled();

  // The photo, then the box burst: the models are asked again for that effect, and the Run button follows the answer.
  await page.getByLabel('Ảnh sản phẩm', { exact: true }).setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('group', { name: 'Sản phẩm', exact: true }).getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
  const asked = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/models' && new URL(r.url()).searchParams.get('effect') === 'box-burst');
  await effects(page).getByRole('radio', { name: 'Hộp bung mở' }).check();
  const query = new URL((await asked).url()).searchParams;
  expect([query.get('feature'), query.get('ratio'), query.get('durationSec')]).toEqual(['hook_effect', '9:16', '5']);
  await expect(runButton(page)).toBeEnabled();

  const sent: Record<string, unknown>[] = [];
  page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/jobs' && sent.push(r.postDataJSON())));
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ feature: 'hook_effect', modelId: 'mock-hook-reveal-e2e', ratio: '9:16', durationSec: 5, prompt: hookEffectPrompt('box-burst'), params: { effect: 'box-burst' } });

  // History names the effect and the clip finishes.
  const card = page.locator('.job-card').filter({ has: page.getByRole('heading', { name: 'Hiệu ứng mở đầu · Hộp bung mở', level: 3 }) });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 90_000 });

  // The job holds what the page sent, with the photo as its end frame.
  const [job] = await mine(page);
  expect(job).toMatchObject({ effect: 'box-burst', status: 'succeeded' });
  const detail = (await (await page.request.get(`/api/jobs/${job!.id}`)).json()) as Record<string, unknown> & { inputIds: string[]; endFrame: { id: string } };
  expect(detail).toMatchObject({ feature: 'hook_effect', effect: 'box-burst', prompt: hookEffectPrompt('box-burst'), ratio: '9:16', durationSec: 5, isMock: true });
  expect(detail.endFrame.id).toBe(detail.inputIds[0]);

  // Dùng lại brings the photo and the effect back, whatever the form shows meanwhile.
  await page.goto(`/apps/hook-effects?reuse=${job!.id}`);
  await expect(page.getByRole('group', { name: 'Sản phẩm', exact: true }).getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(effects(page).getByRole('radio', { name: 'Hộp bung mở' })).toBeChecked();
  await expect(effects(page).getByRole('radio', { name: 'Phồng rồi bóp' })).not.toBeChecked();

  // The Library's app chip finds the job.
  await page.goto('/library');
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Hook A' });
  await page.getByRole('group', { name: 'Loại', exact: true }).getByRole('button', { name: 'Ứng dụng', exact: true }).click();
  await page.getByRole('group', { name: 'Theo ứng dụng' }).getByRole('button', { name: 'Hiệu ứng mở đầu', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
});

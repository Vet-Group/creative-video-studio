// Lingerie Try-On's stock models and Jewelry Try-On's template library. The test server has no samples, so the Admin uploads a few under the real names first
// and removes them afterwards. No job is run: picking a photo only copies the sample into the member's own assets.
import { expect, type Page, test } from '@playwright/test';
import { jpg, signIn } from './support.test';

const NAMES = ['lingerie-model-m10.jpg', 'lingerie-model-m11.jpg', 'jewelry-template-ear-01.jpg', 'jewelry-template-ear-02.jpg', 'jewelry-template-neck-01.jpg'];
/** The slot's button, once the samples are known (it then opens the photo dialog instead of the file picker). */
const browse = async (page: Page, slot: string) => {
  const button = page.getByRole('button', { name: `Tải lên ${slot}` });
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  await button.click();
};
const reasonOf = (page: Page) => page.locator('.form-message').getByRole('status');

test('the stock models of Lingerie Try-On and the templates of Jewelry Try-On fill their slot without creating a job', async ({ page }) => {
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of NAMES) expect((await each(name)).ok()).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: jpg(), headers: { 'content-type': 'image/jpeg' } }));
  try {
    await signIn(page, 'stocka');
    const copies: string[] = [];
    page.on('request', (r) => r.url().endsWith('/api/assets/samples') && copies.push(r.postData() ?? ''));

    // Lingerie Try-On: the pieces (several) and the model, with the optional text, ratio and resolution fields.
    await page.goto('/apps/lingerie-try-on');
    await expect(page.getByRole('group', { name: 'Đồ lót' })).toBeVisible();
    await expect(page.getByLabel('Mô tả (tuỳ chọn)')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Tỉ lệ', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Độ phân giải', exact: true })).toBeVisible();
    await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Đồ lót.');
    await browse(page, 'Người mẫu');
    const models = page.getByRole('dialog', { name: 'Chọn người mẫu' });
    await expect(models.getByRole('button', { name: /^Người mẫu có sẵn/ })).toHaveCount(2);
    await models.getByRole('button', { name: 'Người mẫu có sẵn 2' }).click();
    await expect(models).toHaveCount(0);
    expect(copies).toEqual([JSON.stringify({ names: ['lingerie-model-m11.jpg'] })]);
    const model = page.getByRole('group', { name: 'Người mẫu' }).locator('img');
    await expect(model).toHaveCount(1);
    await expect(model).toHaveAttribute('src', /^\/api\/assets\/[^/]+\/content$/); // the member's own copy, not the sample
    await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Đồ lót.');

    // Jewelry Try-On: the groups that have photos, each under its own heading; a group with none does not show.
    await page.goto('/apps/jewelry-try-on');
    await browse(page, 'Người đeo');
    const templates = page.getByRole('dialog', { name: 'Chọn mẫu' });
    await expect(templates.getByRole('heading', { level: 3 })).toHaveText(['Tai', 'Cổ & ngực']);
    await expect(templates.getByRole('region', { name: 'Tai' }).getByRole('button')).toHaveCount(2);
    await expect(templates.getByRole('region', { name: 'Cổ & ngực' }).getByRole('button')).toHaveCount(1);
    await templates.getByRole('button', { name: 'Tai 2' }).click();
    await expect(templates).toHaveCount(0);
    expect(copies.at(-1)).toBe(JSON.stringify({ names: ['jewelry-template-ear-02.jpg'] }));
    await expect(page.getByRole('group', { name: 'Người đeo' }).locator('img')).toHaveCount(1);
    await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Trang sức.');

    // Upload stays possible, and nothing was run.
    await page.getByRole('button', { name: 'Bỏ ảnh' }).click();
    await browse(page, 'Người đeo');
    await expect(page.getByRole('dialog', { name: 'Chọn mẫu' }).getByText('Tải lên ảnh của bạn')).toBeVisible();
    const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string }[] };
    expect(jobs.jobs.filter((j) => j.feature === 'jewelry_try_on' || j.feature === 'lingerie_try_on')).toEqual([]);
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

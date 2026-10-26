import { expect, test } from '@playwright/test';
import { runInUi, signIn } from './support.test';

test('a job that finished while the tab was closed shows its result on return', async ({ context }) => {
  const first = await context.newPage();
  await signIn(first, 'member2');
  await runInUi(first);
  await first.close();

  // The mock job takes a few seconds; wait until it is long done.
  await new Promise((resolve) => setTimeout(resolve, 15_000));

  const back = await context.newPage();
  await back.goto('/create');
  await back.getByRole('tab', { name: 'Lịch sử' }).click(); // Create opens on Examples; the job is in History
  const tray = back.getByRole('complementary', { name: 'Job của tôi' });
  await expect(tray.getByText('Hoàn tất')).toBeVisible();
  await expect(back.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible();
  await expect(tray.getByText('MOCK', { exact: true })).toBeVisible();
});

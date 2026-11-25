import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { presetPeriod } from '../src/lib/period';
import { signIn } from './support.test';

// Admin > Usage: who used CVS in a period per team, the real-user switch, a quick period and the CSV and PNG downloads.
test('an Admin reads who used CVS per team, shows every account, picks 7 days and downloads the CSV and a PNG', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/overview');
  const nav = page.getByRole('navigation', { name: 'Các trang quản trị' }).getByRole('link', { name: 'Mức độ sử dụng', exact: true });
  await nav.click();
  await expect(page).toHaveURL(/\/admin\/usage$/);
  await expect(nav).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Mức độ sử dụng' })).toBeVisible();
  // This ICT month by default, the figures, and a card per team with a row per person.
  await expect(page.getByRole('button', { name: 'Tháng này', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Số liệu chung' }).getByText('Nhân viên', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Người dùng của / }).first()).toBeVisible();
  await expect(page.getByRole('row', { name: /^E2E Admin / })).toBeVisible();

  // Real users only: the system account is hidden and counted in the note; switching it off lists it, tagged, and keeps it in the address.
  const real = page.getByRole('switch', { name: 'Chỉ người dùng thật' });
  const system = page.getByRole('row', { name: /^E2E System Library/ });
  await expect(real).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/^Đã ẩn [1-9]\d* tài khoản hệ thống, tài khoản thử và team không tính báo cáo\.$/)).toBeVisible();
  await expect(system).toHaveCount(0);
  await real.click();
  await expect(page).toHaveURL(/[?&]real=0(&|$)/);
  await expect(real).toHaveAttribute('aria-checked', 'false');
  await expect(system).toBeVisible();
  await expect(system.getByText('Hệ thống', { exact: true })).toBeVisible();

  // A quick choice goes to the address and the CSV link, the switch kept.
  const week = presetPeriod('7d');
  await page.getByRole('button', { name: '7 ngày', exact: true }).click();
  await expect(page.getByRole('button', { name: '7 ngày', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(new RegExp(`[?&]from=${week.from}&to=${week.to}(&|$)`));
  const csv = page.getByRole('link', { name: 'Tải CSV', exact: true });
  await expect(csv).toHaveAttribute('href', `/api/admin/usage/csv?from=${week.from}&to=${week.to}&real=0`);
  const res = await page.request.get((await csv.getAttribute('href'))!);
  expect(res.status()).toBe(200);
  expect((await res.text()).split('\r\n')[0]).toBe(`﻿Creative Video Studio usage ${week.from} to ${week.to} (all accounts)`);

  // The PNG: a download named after the period, 1200 px wide at twice the pixels.
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Tải ảnh PNG', exact: true }).click()]);
  expect(file.suggestedFilename()).toBe(`cvs-usage-${week.from}-${week.to}.png`);
  const png = await readFile((await file.path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(2400);
  await expect(page.getByRole('button', { name: 'Tải ảnh PNG', exact: true })).toBeEnabled();
});

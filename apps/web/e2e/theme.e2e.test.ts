import { expect, type Page, test } from '@playwright/test';
import { openSettings, signIn } from './support.test';

const WHITE = 'rgb(255, 255, 255)';
const DARK = 'rgb(22, 22, 24)';
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeAttr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

async function themeChoice(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Tuỳ chọn', exact: true }).click();
  return settings.getByRole('radiogroup', { name: 'Giao diện' });
}

test('Dark applies at once and is on <html> before the first paint after a reload; System follows the OS; Light overrides it', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // When the stored theme reaches <html>: before <body> exists means before anything is painted.
  await page.addInitScript(() => {
    const w = window as unknown as { themeBeforeBody?: boolean; themeAtLoad?: string | null };
    // The document itself, as <html> may not be parsed yet when this runs.
    new MutationObserver(() => void (w.themeBeforeBody ??= document.body === null)).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('DOMContentLoaded', () => void (w.themeAtLoad = document.documentElement.getAttribute('data-theme')));
  });
  await signIn(page, 'thema');
  let choice = await themeChoice(page);
  await expect(choice.getByRole('radio', { name: 'Theo hệ thống' })).toBeChecked(); // the default
  expect(await bodyBg(page)).toBe(WHITE);

  await choice.getByRole('radio', { name: 'Tối' }).check();
  expect(await themeAttr(page)).toBe('dark');
  await expect.poll(() => bodyBg(page)).toBe(DARK);
  await expect(page.getByRole('dialog', { name: 'Cài đặt' }).getByText('Phím tắt', { exact: true })).toBeVisible(); // the shortcuts list stays

  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { themeAtLoad?: string | null }).themeAtLoad)).toBe('dark');
  expect(await page.evaluate(() => (window as unknown as { themeBeforeBody?: boolean }).themeBeforeBody)).toBe(true);
  expect(await bodyBg(page)).toBe(DARK);
  choice = await themeChoice(page);
  await expect(choice.getByRole('radio', { name: 'Tối' })).toBeChecked();

  await choice.getByRole('radio', { name: 'Theo hệ thống' }).check();
  expect(await themeAttr(page)).toBeNull();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => bodyBg(page)).toBe(DARK);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => bodyBg(page)).toBe(WHITE);

  await page.emulateMedia({ colorScheme: 'dark' });
  await choice.getByRole('radio', { name: 'Sáng' }).check();
  expect(await themeAttr(page)).toBe('light');
  await expect.poll(() => bodyBg(page)).toBe(WHITE);

  // The login page keeps its own studio look in every theme.
  const visitor = await browser.newContext({ colorScheme: 'dark' });
  const login = await visitor.newPage();
  await login.addInitScript(() => localStorage.setItem('cvs.theme', 'dark'));
  await login.goto('/login');
  expect(await themeAttr(login)).toBe('dark');
  await expect(login.locator('.login-form')).toHaveCSS('background-color', WHITE);
  await visitor.close();
});

test('on a phone the dark theme has no sideways scroll, on a page and in Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('cvs.theme', 'dark'));
  await signIn(page, 'thema');
  expect(await bodyBg(page)).toBe(DARK);
  const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  expect(await scrollWidth()).toBeLessThanOrEqual(390);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /^Tuỳ chọn/ }).click();
  await expect(settings.getByRole('radiogroup', { name: 'Giao diện' }).getByRole('radio', { name: 'Tối' })).toBeChecked();
  expect(await scrollWidth()).toBeLessThanOrEqual(390);
  expect(await settings.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
});

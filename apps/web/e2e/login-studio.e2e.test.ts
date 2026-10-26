// The studio login: flashlight reveal per device mode, keyboard, submit, the day/night scene, layout, the forgot hint, the redirect and axe.
// Every test first checks the media the mode depends on, so a wrong emulation fails loudly instead of testing the wrong mode.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

const DESKTOP = { width: 1440, height: 900 };

const hoverNone = (page: Page) => page.evaluate(() => matchMedia('(hover: none)').matches);
const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
};

function parts(page: Page) {
  return {
    pw: page.getByLabel('Mật khẩu'),
    eye: page.getByRole('button', { name: 'Hiện ký tự đã gõ', exact: true }),
    submit: page.getByRole('button', { name: 'Đăng nhập', exact: true }),
    scene: page.getByRole('button', { name: 'Cảnh ban đêm', exact: true }),
    card: page.locator('.login'),
  };
}

/** Opens /login and waits until React has hydrated (the eye stays disabled before). */
async function open(page: Page) {
  await page.goto('/login');
  const p = parts(page);
  await expect(p.eye).toBeEnabled();
  return p;
}

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('pointer: the beam follows the pointer, lights only the characters inside it and turns the mascot lens', async ({ page }) => {
    const { pw, eye, card } = await open(page);
    expect(await hoverNone(page)).toBe(false);
    await pw.fill('abcdefgh');
    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAttribute('data-flashlight', 'pointer');
    await expect(card).toHaveAttribute('data-dark', 'true');
    await expect(pw).toHaveAttribute('type', 'text');
    await expect(pw).toHaveAttribute('autocomplete', 'current-password');
    await expect(pw).toHaveAttribute('required', '');
    expect(await pw.evaluate((e) => getComputedStyle(e).webkitTextFillColor)).toBe('rgba(0, 0, 0, 0)');

    const lit = page.locator('.password-reveal [data-lit="true"]');
    const field = await box(pw);
    await page.mouse.move(field.x - 40, field.y + field.height / 2);
    await expect(page.locator('.password-reveal span')).toHaveCount(8);
    await expect(lit).toHaveCount(8);

    const eyeBox = await box(eye);
    await page.mouse.move(eyeBox.x + eyeBox.width / 2, 5);
    await expect(lit).toHaveCount(0);
    const mascot = page.locator('.mascot');
    const angle = () => mascot.evaluate((e) => (e as SVGGElement).style.getPropertyValue('--lens-angle'));
    await expect.poll(angle).not.toBe('');
    const up = await angle();

    const m = await box(mascot);
    await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
    await expect(mascot).toHaveAttribute('data-lit', 'true');
    await expect.poll(angle).not.toBe(up);

    await eye.click();
    await expect(page.locator('.password-reveal')).toHaveCount(0);
    await expect(pw).toHaveAttribute('type', 'password');
    await expect(card).toHaveAttribute('data-flashlight', 'off');
  });

  test('keyboard: Tab reaches the eye from the password, Enter and Space toggle it', async ({ page }) => {
    const { pw, eye } = await open(page);
    expect(await hoverNone(page)).toBe(false);
    await pw.focus();
    await page.keyboard.press('Tab');
    await expect(eye).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    await expect(pw).toHaveAttribute('type', 'text');
    await page.keyboard.press('Space');
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect(pw).toHaveAttribute('type', 'password');
    await expect(eye).toHaveAccessibleName('Hiện ký tự đã gõ');
  });

  test('submit turns the reveal off and shows a busy label the old sign-in locator still finds', async ({ page }) => {
    const { pw, eye, submit } = await open(page);
    expect(await hoverNone(page)).toBe(false);
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/api/auth/sign-in/email', async (route) => {
      await gate;
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD' }) });
    });
    await page.getByLabel('Email').fill('nobody@e2e.test');
    await pw.fill('secret-1');
    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    expect(await submit.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(220, 38, 38)');

    await submit.click();
    const busy = page.locator('button[type="submit"]');
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await expect(busy).toHaveText('Đang đăng nhập…');
    await expect(busy).toBeDisabled();
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect(pw).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toHaveCount(1);

    release();
    await expect(page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' })).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test('scene: the studio is drawn, and the day/night toggle changes only the scene', async ({ page }) => {
    const { pw, eye, scene, card } = await open(page);
    expect(await hoverNone(page)).toBe(false);
    await expect(page.locator('.scene-turntable')).toBeVisible();
    await expect(page.locator('.scene-box')).toBeVisible();
    expect(await page.locator('.scene-light').count()).toBeGreaterThanOrEqual(2);
    const wall = () => page.locator('.scene-wall').evaluate((e) => getComputedStyle(e).fill);
    const day = await wall();

    await scene.click();
    await expect(scene).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAttribute('data-scene', 'night');
    await expect(card).toHaveAttribute('data-dark', 'true');
    await expect.poll(wall).not.toBe(day);
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect(pw).toHaveAttribute('type', 'password');

    await eye.click();
    await scene.click();
    await expect(card).toHaveAttribute('data-scene', 'day');
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAttribute('data-flashlight', 'pointer');
  });

  for (const viewport of [DESKTOP, { width: 1280, height: 800 }]) {
    test(`layout at ${viewport.width}: the scene sits left of the form, with the VET logo, the heading and the Admin helper`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page);
      expect(await hoverNone(page)).toBe(false);
      const sceneBox = await box(page.locator('.login-scene'));
      const formBox = await box(page.locator('.login-form'));
      expect(sceneBox.x + sceneBox.width).toBeLessThanOrEqual(formBox.x + 1);
      expect(Math.abs(sceneBox.y - formBox.y)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('img', { name: 'VET Group', exact: true })).toBeVisible();
      await expect(page.getByText('Creative Video Studio', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
      await expect(page.getByText('Tài khoản do Admin tạo. Liên hệ Admin nếu bạn chưa có tài khoản.')).toBeVisible();
      await expect(page.getByText('Đăng ký')).toHaveCount(0);
      await expect(page).toHaveTitle('Creative Video Studio');
    });
  }

  test('forgot password shows the Admin hint and sends no request', async ({ page }) => {
    await open(page);
    expect(await hoverNone(page)).toBe(false);
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/')) calls.push(r.url());
    });
    await page.getByRole('button', { name: 'Quên mật khẩu?', exact: true }).click();
    await expect(page.getByText('Liên hệ Admin để đặt lại mật khẩu.')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('a signed-in user who opens /login goes to Create', async ({ page }) => {
    await signIn(page, 'member1');
    expect(await hoverNone(page)).toBe(false);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/create$/);
  });

  test('axe finds no serious or critical issue in day and night, and no unresolved contrast on the form', async ({ page }) => {
    const { scene, card } = await open(page);
    expect(await hoverNone(page)).toBe(false);
    for (const night of [false, true]) {
      if (night) {
        await scene.click();
        await expect(card).toHaveAttribute('data-scene', 'night');
        // Contrast is measured only after the scene colour transitions have finished.
        await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
      }
      const all = await new AxeBuilder({ page }).exclude('nextjs-portal').analyze();
      expect(all.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
      const form = await new AxeBuilder({ page }).include('.login-form').analyze();
      expect(form.incomplete.filter((r) => r.id === 'color-contrast').map((r) => r.nodes.map((n) => n.target))).toEqual([]);
    }
  });
});

test.describe('touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('touch: the eye lights the whole field with a fixed beam, controls are 44 px, and the form comes first', async ({ page }) => {
    const { pw, eye, submit, scene, card } = await open(page);
    expect(await hoverNone(page)).toBe(true);
    await eye.tap();
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAttribute('data-flashlight', 'touch');
    await expect(pw).toHaveAttribute('type', 'text');
    await expect(page.locator('.beam[data-fixed="true"]')).toBeVisible();
    await expect(page.locator('.password-reveal')).toHaveCount(0);
    await eye.tap();
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect(pw).toHaveAttribute('type', 'password');
    await expect(card).toHaveAttribute('data-flashlight', 'off');

    const forgot = page.getByRole('button', { name: 'Quên mật khẩu?', exact: true });
    for (const control of [eye, scene, forgot, submit, pw, page.getByLabel('Email')]) expect((await box(control)).height).toBeGreaterThanOrEqual(44);
    for (const icon of [eye, scene]) expect((await box(icon)).width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const formBox = await box(page.locator('.login-form'));
    expect(formBox.y + formBox.height).toBeLessThanOrEqual((await box(page.locator('.login-scene'))).y + 1);
    const s = await box(submit);
    expect(s.y + s.height).toBeLessThanOrEqual(844);
  });
});

test.describe('narrow window with a mouse', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('narrow pointer: the beam lights the whole password but stays off the Email field, the submit button and the page backdrop', async ({ page }) => {
    const { pw, eye, submit, card } = await open(page);
    expect(await hoverNone(page)).toBe(false);
    await pw.fill('abcdefgh');
    await eye.click();
    await expect(card).toHaveAttribute('data-flashlight', 'pointer');
    const field = await box(pw);
    await page.mouse.move(field.x - 40, field.y + field.height / 2);
    await expect(page.locator('.password-reveal [data-lit="true"]')).toHaveCount(8);
    // Aimed along the field the beam is unrotated, so its box is its drawn extent.
    const beamBox = await box(page.locator('.beam'));
    const email = await box(page.getByLabel('Email'));
    expect(beamBox.y).toBeGreaterThanOrEqual(email.y + email.height);
    expect(beamBox.y + beamBox.height).toBeLessThanOrEqual((await box(submit)).y);
    // It ends at the card's left edge rather than spilling onto the page backdrop.
    expect(beamBox.x).toBeGreaterThanOrEqual((await box(page.locator('.login-card'))).x - 1);
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: DESKTOP, contextOptions: { reducedMotion: 'reduce' } });

  test('reduced motion: no beam and no mascot; the eye simply shows and hides the password', async ({ page }) => {
    const { pw, eye, card } = await open(page);
    expect(await hoverNone(page)).toBe(false);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expect(page.locator('.mascot')).toBeHidden();
    await eye.click();
    await expect(pw).toHaveAttribute('type', 'text');
    await expect(card).toHaveAttribute('data-flashlight', 'plain');
    await expect(card).toHaveAttribute('data-dark', 'false');
    await expect(page.locator('.beam')).toHaveCount(0);
    await expect(page.locator('.mascot')).toBeHidden();
    await eye.click();
    await expect(pw).toHaveAttribute('type', 'password');
  });
});

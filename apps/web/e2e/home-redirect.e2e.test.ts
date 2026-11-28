import { expect, test } from '@playwright/test';
import { signIn } from './support.test';
import { USERS } from './users';

// `/` sends a member to the tool their team lands on (teams.default_tool, else Create). Once a page has saved that tool in a cookie, src/proxy.ts sends
// `/` there at once, with no page render or database read; without the cookie app/page.tsx decides, as it did before.
test('the home address goes straight to the landing page the last page saved, and still works without it', async ({ browser, baseURL }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  const { id } = (await (await admin.request.post('/api/admin/teams', { data: { name: `Home E2E ${Date.now().toString(36)}` } })).json()) as { id: string };
  expect((await admin.request.patch(`/api/admin/teams/${id}`, { data: { defaultTool: '/explore' } })).ok()).toBe(true);
  const { users } = (await (await admin.request.get('/api/admin/users')).json()) as { users: { id: string; email: string }[] };
  const member = users.find((u) => u.email === USERS.homea.email)!;
  expect((await admin.request.patch(`/api/admin/users/${member.id}`, { data: { teamId: id } })).ok()).toBe(true);
  await admin.context().close();

  const context = await browser.newContext();
  const page = await context.newPage();
  const savedLanding = async () => (await context.cookies()).find((c) => c.name === 'cvs-home')?.value;
  const homeAnswer = async () => {
    const r = await page.request.get('/', { maxRedirects: 0 });
    return [r.status(), new URL(r.headers().location ?? '', baseURL).pathname];
  };
  await signIn(page, 'homea');
  // The app layout saves the team's tool on every page.
  await expect.poll(savedLanding).toBe('/explore');
  expect(await homeAnswer()).toEqual([307, '/explore']);

  // Without the cookie the page itself decides, from the team, and the next page saves it again.
  await context.clearCookies({ name: 'cvs-home' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/explore$/);
  await expect.poll(savedLanding).toBe('/explore');

  // The proxy answers on the cookie alone, signed in or not; a value that is not a landing page is ignored.
  const visitor = await browser.newContext();
  await visitor.addCookies([{ name: 'cvs-home', value: '/image-generation', url: baseURL! }]);
  const saved = await visitor.request.get('/', { maxRedirects: 0 });
  expect([saved.status(), new URL(saved.headers().location!, baseURL).pathname]).toEqual([307, '/image-generation']);
  await visitor.addCookies([{ name: 'cvs-home', value: '/admin', url: baseURL! }]);
  const other = await visitor.request.get('/', { maxRedirects: 0 });
  expect([other.status(), new URL(other.headers().location!, baseURL).pathname]).toEqual([307, '/login']);
  await visitor.close();
  await context.close();
});

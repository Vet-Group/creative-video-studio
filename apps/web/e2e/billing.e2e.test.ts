import { type Browser, expect, type Page, test } from '@playwright/test';
import { type UserKey, USERS } from './users';
import { optionsOf, png, select, signIn } from './support.test';

// Billing teams (docs/BILLING.md). The spec makes a billing team and two stores of its own, so no other spec's member or store is restricted:
// only billa joins the team.
const unique = Date.now().toString(36);
const TEAM = `Sales E2E ${unique}`;
const OWN = `Team Shop ${unique}`;
const OTHER = `Other Shop ${unique}`;

async function as(browser: Browser, user: UserKey, width = 1440): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.setViewportSize({ width, height: 1000 });
  await signIn(page, user);
  return page;
}

let ids: { team: string; own: string; other: string } | undefined;

/** The team, its store and another store, set up by the Admin through the API; billa is moved into the team. */
async function setUp(admin: Page) {
  if (ids) return ids;
  const post = async (path: string, data: unknown) => ((await (await admin.request.post(path, { data })).json()) as { id: string }).id;
  const team = await post('/api/admin/teams', { name: TEAM });
  const own = await post('/api/admin/stores', { name: OWN, code: `TS-${unique}` });
  const other = await post('/api/admin/stores', { name: OTHER, code: `OS-${unique}` });
  expect((await admin.request.patch(`/api/admin/teams/${team}`, { data: { billable: true, freeMonthlyUsd: '20', storeIds: [own] } })).ok()).toBe(true);
  const { users } = (await (await admin.request.get('/api/admin/users')).json()) as { users: { id: string; email: string }[] };
  const billa = users.find((u) => u.email === USERS.billa.email)!;
  expect((await admin.request.patch(`/api/admin/users/${billa.id}`, { data: { teamId: team } })).ok()).toBe(true);
  ids = { team, own, other };
  return ids;
}

test('an Admin makes a billing team with its store, and its member picks and runs only for that store', async ({ browser }) => {
  const admin = await as(browser, 'admin');
  const { other } = await setUp(admin);

  // Admin › Nhóm shows the team as a billing team with its allowance, and its store ticked under the row.
  await admin.goto('/admin/teams');
  await expect(admin.getByLabel(`Nhóm ${TEAM} là team bán hàng (tính phí)`)).toBeChecked();
  await expect(admin.getByLabel(`Miễn phí mỗi tháng của ${TEAM} (USD)`)).toHaveValue('20');
  await admin.getByRole('button', { name: `Cửa hàng của ${TEAM}: 1` }).click();
  await expect(admin.getByLabel(`Cửa hàng ${OWN} của nhóm ${TEAM}`)).toBeChecked();
  await expect(admin.getByLabel(`Cửa hàng ${OTHER} của nhóm ${TEAM}`)).not.toBeChecked();
  // Admin › Cửa hàng names the store's team.
  await admin.goto('/admin/stores');
  await expect(admin.getByLabel(`Nhóm của ${OWN}`).locator('option:checked')).toHaveText(`${TEAM} (tính phí)`);

  // The member's picker on Create lists only the team's store, beside "none".
  const member = await as(browser, 'billa');
  await select(member, 'Cửa hàng/Thương hiệu').click();
  await expect(optionsOf(member, 'Cửa hàng/Thương hiệu').filter({ hasText: OWN })).toHaveCount(1);
  await expect(optionsOf(member, 'Cửa hàng/Thương hiệu').filter({ hasText: OTHER })).toHaveCount(0);
  await expect(optionsOf(member, 'Cửa hàng/Thương hiệu').filter({ hasText: 'E2E Shop' })).toHaveCount(0);
  await expect(optionsOf(member, 'Cửa hàng/Thương hiệu').filter({ hasText: 'Không chọn' })).toHaveCount(1);
  await member.keyboard.press('Escape');

  // A Run for another store is refused by the server, whatever the form sent.
  const up = await member.request.post('/api/assets', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png() } } });
  expect(up.status()).toBe(201);
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  const refused = await member.request.post('/api/jobs', { data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, storeId: other } });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ code: 'store_not_in_team' });
  await admin.context().close();
  await member.context().close();
});

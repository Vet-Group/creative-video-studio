// A billing team's month in a member's own limits (docs/BILLING.md): only a member of a billing team, in the company workspace, gets `team`, and only
// their own team's figure. Against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET } = await import('./route');

const PASSWORD = 'correct-horse-battery';
let seq = 0;
async function newUser(teamId: string, role: 'member' | 'admin' = 'member') {
  const email = `l${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role, data: { teamId } } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;
const limits = async (u: User, workspace?: string) =>
  (await (await GET(new Request('http://localhost/api/me/limits', { headers: { cookie: `${u.cookie}${workspace ? `; cvs_ws=${workspace}` : ''}` } }))).json()) as Record<string, unknown>;

let month = '';
let seller: User; // billing team A
let teammate: User; // billing team A, an Admin
let otherSeller: User; // billing team B
let designer: User; // not a billing team
let dual: User; // billing team A, also in a partner workspace

async function llm(ref: string, user: User, usd: string, workspace = 'ws_vet') {
  await pool.query(
    `insert into cost_entries (kind, usd, month, day, user_id, team_id, is_final, ref, workspace_id) values ('llm', $1, $2, $3, $4, 'team-unassigned', true, $5, $6)`,
    [usd, month, `${month}-01`, user.id, ref, workspace],
  );
}

beforeAll(async () => {
  month = (await pool.query(`select to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as m`)).rows[0].m;
  await pool.query(`insert into teams (id, name, billable, free_monthly_usd) values ('sales-a', 'Sales A', true, 20), ('sales-b', 'Sales B', true, 20), ('design', 'Design', false, 20)`);
  await pool.query(`insert into workspaces (id, name) values ('ws_p', 'Partner P')`);
  [seller, teammate, otherSeller, designer, dual] = [await newUser('sales-a'), await newUser('sales-a', 'admin'), await newUser('sales-b'), await newUser('design'), await newUser('sales-a')];
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_p', $1, 'member')`, [dual.id]);
  await llm('s-1', seller, '15.0000');
  await llm('t-1', teammate, '7.5000');
  await llm('o-1', otherSeller, '50.0000');
  await llm('d-1', designer, '3.0000');
  await llm('p-1', dual, '9.0000', 'ws_p'); // a partner's row, never team A's
});
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('a billing team’s member sees the team’s month total, allowance and payable, an Admin of the team too', async () => {
  const team = { name: 'Sales A', monthUsd: '22.5000', freeUsd: '20.0000', payableUsd: '2.5000', provisional: false };
  expect((await limits(seller)).team).toEqual(team);
  expect((await limits(teammate)).team).toEqual(team);
  expect((await limits(otherSeller)).team).toEqual({ name: 'Sales B', monthUsd: '50.0000', freeUsd: '20.0000', payableUsd: '30.0000', provisional: false });
  // The usual caps are still there, unchanged.
  expect(await limits(seller)).toMatchObject({ clips: { used: 0 }, monthToDate: { usd: '15.0000' } });
});

test('a member outside billing teams, and a billing member acting in a partner workspace, get nothing new', async () => {
  expect(await limits(designer)).not.toHaveProperty('team');
  const inPartner = await limits(dual, 'ws_p');
  expect(inPartner).not.toHaveProperty('team');
  expect(inPartner).toMatchObject({ dayUsd: null, monthUsd: null, monthToDate: null });
  expect((await limits(dual)).team).toMatchObject({ name: 'Sales A', monthUsd: '22.5000' }); // back in the company: the partner row is not the team's
});

// Try On's ?model= (a saved AI model's use-in-Try-On link) against a disposable database on the compose Postgres (`pnpm services:up`):
// only a saved model a Run may take, the member's own or a shared one of the active workspace, reaches the Model slot.
import { randomBytes } from 'node:crypto';
import type { ReactElement } from 'react';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

vi.mock('@/lib/current-user', () => ({ currentUser: vi.fn() }));
vi.mock('@/components/TryOn', () => ({ TryOn: () => null }));

const { auth, pool } = await import('@/lib/auth');
const { currentUser } = await import('@/lib/current-user');
const { default: TryOnPage } = await import('./page');

let me: string;
let other: string;

beforeAll(async () => {
  const user = async (email: string) => (await auth.api.createUser({ body: { email, name: email, password: 'correct-horse-battery', role: 'member' } })).user.id;
  me = await user('me@example.test');
  other = await user('other@example.test');
  await pool.query(`insert into workspaces (id, name) values ('ws_partner', 'Partner')`);
  const asset = (id: string, owner: string, workspace = 'ws_vet') =>
    pool.query(`insert into assets (id, owner_id, workspace_id, kind, s3_key, filename, mime, bytes) values ($1, $2, $3, 'input', $1, $4, 'image/png', 10)`, [id, owner, workspace, `${id}.png`]);
  const model = async (id: string, owner: string, o: { shared?: boolean; workspace?: string } = {}) => {
    await asset(`a-${id}`, owner, o.workspace);
    await pool.query(`insert into fashion_models (id, user_id, name, asset_id, traits, shared, workspace_id) values ($1, $2, $3, $4, '{}', $5, $6)`, [id, owner, `Model ${id}`, `a-${id}`, o.shared ?? false, o.workspace ?? 'ws_vet']);
  };
  await model('mine', me);
  await model('shared', other, { shared: true });
  await model('private', other);
  await model('partner', me, { workspace: 'ws_partner' });
  await asset('plain-input', me); // the member's own photo, but not a saved model
  vi.mocked(currentUser).mockResolvedValue({ id: me, role: 'member', workspaceId: 'ws_vet' } as Awaited<ReturnType<typeof currentUser>>);
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

const open = async (q: Record<string, string>) => ((await TryOnPage({ searchParams: Promise.resolve(q) })) as ReactElement<{ model?: unknown; reuse?: string }>).props;

test("puts the member's own saved model, or a shared one, in the Model slot", async () => {
  expect((await open({ model: 'a-mine' })).model).toEqual({ id: 'a-mine', filename: 'Model mine' });
  expect((await open({ model: 'a-shared' })).model).toEqual({ id: 'a-shared', filename: 'Model shared' });
});

test("ignores another member's private model, one of another workspace, a photo that is no saved model and an unknown id", async () => {
  for (const model of ['a-private', 'a-partner', 'plain-input', 'no-such-asset']) expect((await open({ model })).model, model).toBeUndefined();
  vi.mocked(currentUser).mockResolvedValueOnce({ id: me, role: 'admin', workspaceId: 'ws_vet' } as Awaited<ReturnType<typeof currentUser>>);
  expect((await open({ model: 'a-private' })).model).toBeUndefined(); // an Admin sees it in the list, but a Run cannot take it
  vi.mocked(currentUser).mockResolvedValueOnce(null);
  expect((await open({ model: 'a-mine' })).model).toBeUndefined(); // signed out
});

test('a refill link wins over the model', async () => {
  const props = await open({ reuse: 'job-1', model: 'a-mine' });
  expect(props.reuse).toBe('/api/jobs/job-1');
  expect(props.model).toBeUndefined();
});

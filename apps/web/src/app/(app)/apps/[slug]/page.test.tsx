// The app page's ?image= photo (History's Background Remover and Image Upscale buttons) against a disposable database on the compose Postgres (`pnpm services:up`):
// only the member's own image input in the active workspace reaches the form.
import { randomBytes } from 'node:crypto';
import type { ReactElement } from 'react';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

vi.mock('@/lib/current-user', () => ({ currentUser: vi.fn() }));
vi.mock('@/components/AppPage', () => ({ AppPage: () => null }));
vi.mock('@/components/FashionModelApp', () => ({ FashionModelApp: () => null }));
vi.mock('@/components/HookEffectsApp', () => ({ HookEffectsApp: () => null }));
vi.mock('@/components/MediaOptimizer', () => ({ MediaOptimizer: () => null }));
vi.mock('@/components/SmartRemakeApp', () => ({ SmartRemakeApp: () => null }));
vi.mock('@/components/VideoEditApp', () => ({ VideoEditApp: () => null }));

const { auth, pool } = await import('@/lib/auth');
const { currentUser } = await import('@/lib/current-user');
const { default: AppRoute } = await import('./page');

let me: string;
let other: string;

beforeAll(async () => {
  const user = async (email: string) => (await auth.api.createUser({ body: { email, name: email, password: 'correct-horse-battery', role: 'member' } })).user.id;
  me = await user('me@example.test');
  other = await user('other@example.test');
  await pool.query(`insert into workspaces (id, name) values ('ws_partner', 'Partner')`);
  const asset = (id: string, owner: string, o: { workspace?: string; kind?: string; mime?: string; deleted?: boolean } = {}) =>
    pool.query(`insert into assets (id, owner_id, workspace_id, kind, s3_key, filename, mime, bytes, deleted_at) values ($1, $2, $3, $4, $1, $5, $6, 10, $7)`, [
      id, owner, o.workspace ?? 'ws_vet', o.kind ?? 'input', `${id}.png`, o.mime ?? 'image/png', o.deleted ? new Date() : null,
    ]);
  await asset('mine', me);
  await asset('theirs', other);
  await asset('mine-partner', me, { workspace: 'ws_partner' });
  await asset('mine-output', me, { kind: 'output' });
  await asset('mine-deleted', me, { deleted: true });
  await asset('mine-video', me, { mime: 'video/mp4' });
  vi.mocked(currentUser).mockResolvedValue({ id: me, workspaceId: 'ws_vet' } as Awaited<ReturnType<typeof currentUser>>);
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

const open = async (q: Record<string, string>, slug = 'background-remover') =>
  ((await AppRoute({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(q) })) as ReactElement<{ image?: unknown; reuse?: string }>).props;

test("puts the member's own image input of the active workspace in the first slot", async () => {
  expect((await open({ image: 'mine' })).image).toEqual({ id: 'mine', filename: 'mine.png' });
  expect((await open({ image: 'mine' }, 'image-upscale')).image).toEqual({ id: 'mine', filename: 'mine.png' });
});

test("refuses another member's input, one of another workspace, an output, a deleted input, a video and an unknown id", async () => {
  for (const image of ['theirs', 'mine-partner', 'mine-output', 'mine-deleted', 'mine-video', 'no-such-asset']) expect((await open({ image })).image, image).toBeUndefined();
  vi.mocked(currentUser).mockResolvedValueOnce({ id: me, workspaceId: 'ws_partner' } as Awaited<ReturnType<typeof currentUser>>);
  expect((await open({ image: 'mine' })).image).toBeUndefined(); // the same input, read from the partner's workspace
  vi.mocked(currentUser).mockResolvedValueOnce(null);
  expect((await open({ image: 'mine' })).image).toBeUndefined(); // signed out
});

test('a refill link wins over the photo', async () => {
  const props = await open({ reuse: 'job-1', image: 'mine' });
  expect(props.reuse).toBe('/api/jobs/job-1');
  expect(props.image).toBeUndefined();
});

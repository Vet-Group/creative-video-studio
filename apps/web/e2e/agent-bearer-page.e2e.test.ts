// An agent access token (lib/agent-access.ts) is accepted by the API's guard() only: a page asked with nothing but the Bearer header is a signed-out
// visit, sent to /login with no app HTML.
import { createHash, randomBytes } from 'node:crypto';
import { createPool } from '@cvs/db/client';
import { expect, test } from '@playwright/test';
import { USERS } from './users';

const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
const db = createPool(url.toString(), 2);

test.afterAll(async () => {
  await db.end();
});

test('agent bearer page: a valid token opens the API, while / and /library redirect to /login with no app HTML', async ({ request }) => {
  const id = randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
  const token = `cvs_pat_${id}_${randomBytes(32).toString('base64url')}`;
  await db.query(
    `insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash, expires_at)
       select $1, u.id, 'ws_vet', 'pat', 'e2e', $2, now() + interval '1 day' from users u where u.email = $3`,
    [id, createHash('sha256').update(token).digest(), USERS.agentadm.email],
  );
  const headers = { authorization: `Bearer ${token}` };
  expect((await request.get('/api/me/limits', { headers })).status()).toBe(200);
  for (const path of ['/', '/library']) {
    const res = await request.get(path, { headers, maxRedirects: 0 });
    expect([path, res.status()]).toEqual([path, 307]);
    expect(new URL(res.headers().location!, 'http://localhost').pathname).toBe('/login');
    const html = await res.text();
    expect(html).not.toContain(USERS.agentadm.name);
    expect(html).not.toContain('<nav');
  }
});

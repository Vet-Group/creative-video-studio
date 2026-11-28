// The MCP endpoint (app/api/mcp/route.ts) end to end: a token calls whoami, uploads an input, dry-runs a job, confirms it, and the job shows in the
// owner's History like a job made in the browser.
import { createHash, randomBytes } from 'node:crypto';
import { createPool } from '@cvs/db/client';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { openTab, png, signIn } from './support.test';
import { USERS } from './users';

const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
const db = createPool(url.toString(), 2);

test.afterAll(async () => {
  await db.end();
});

/** One tools/call as a 2025-era client sends it; the answer comes as one SSE message. */
async function call(request: APIRequestContext, token: string, name: string, args: Record<string, unknown> = {}) {
  const res = await request.post('/api/mcp', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(res.status()).toBe(200);
  const text = await res.text();
  const data = text.split('\n').filter((l) => l.startsWith('data: ')).at(-1)?.slice(6) ?? text;
  return (JSON.parse(data) as { result: { structuredContent: Record<string, any>; isError?: boolean } }).result;
}

test('agent mcp: a token calls whoami, dry-runs and confirms a job, and the job shows in History', async ({ page, request }) => {
  const id = randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
  const token = `cvs_pat_${id}_${randomBytes(32).toString('base64url')}`;
  await db.query(
    `insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash, expires_at)
       select $1, u.id, 'ws_vet', 'pat', 'e2e mcp', $2, now() + interval '1 day' from users u where u.email = $3`,
    [id, createHash('sha256').update(token).digest(), USERS.agentadm.email],
  );

  expect((await call(request, token, 'whoami')).structuredContent).toMatchObject({ user: { email: USERS.agentadm.email }, connection: { id } });
  const upload = await call(request, token, 'asset_upload', { kind: 'image', base64: png().toString('base64'), mime: 'image/png', filename: 'mcp.png' });
  const assetId = upload.structuredContent.assetId as string;
  expect(assetId).toBeTruthy();

  const prompt = `mcp e2e ${id}`;
  const args = { feature: 'image', modelId: 'mock-image-e2e', assetIds: [assetId], ratio: '1:1', prompt, enhance: false, params: { resolution: '2K' } };
  const dry = await call(request, token, 'job_create', args);
  expect(dry.isError).toBeFalsy();
  expect(dry.structuredContent).toMatchObject({ dryRun: true, confirmToken: expect.any(String) });
  const made = await call(request, token, 'job_create', { ...args, confirmToken: dry.structuredContent.confirmToken });
  expect(made.isError).toBeFalsy();
  const jobId = made.structuredContent.jobId as string;
  expect((await db.query('select api_token_id from jobs where id = $1', [jobId])).rows[0].api_token_id).toBe(id);

  await signIn(page, 'agentadm');
  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: prompt });
  await expect(card).toBeVisible({ timeout: 60_000 });
});

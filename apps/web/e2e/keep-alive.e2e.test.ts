import { expect, test } from '@playwright/test';

// serve.ts preloads keep-alive.cjs so the server never closes an idle pooled socket that Playwright is about to reuse (ECONNRESET).
// Node sends `Keep-Alive: timeout=N` only while that idle close is on.
test('the e2e server keeps idle connections open, so a Node-side request never meets a closed socket', async ({ request }) => {
  const res = await request.get('/login');
  expect(res.ok()).toBe(true);
  expect(res.headers()['keep-alive']).toBeUndefined();
});
